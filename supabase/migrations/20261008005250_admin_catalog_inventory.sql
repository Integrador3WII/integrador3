-- SCRUM-11 / SCRUM-13. Additive migration over the existing TextilFlow schema.
-- No business rows are deleted or seeded.

-- The inventory primary key is product_variant_id, not id. Preserve the
-- existing generic audit behaviour for every other table.
create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  insert into public.audit_logs(actor_id, table_name, record_id, action, old_data, new_data)
  values ((select auth.uid()), tg_table_name,
    coalesce(v_row->>'id', v_row->>'product_variant_id')::uuid,
    tg_op, v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create unique index variants_sku_normalized_uq
  on public.product_variants (lower(btrim(sku)));
create unique index variants_combination_normalized_uq
  on public.product_variants (product_id, lower(btrim(color_name)), size_code);
create index inventory_movements_variant_date_idx
  on public.inventory_movements (product_variant_id, created_at desc, id desc);

alter table public.inventory_movements
  add column operation_id uuid,
  add column quantity_after integer check (quantity_after >= 0);
create unique index inventory_movements_operation_uq
  on public.inventory_movements (operation_id) where operation_id is not null;

-- Logical deactivation preserves references and price snapshots.
revoke delete on public.categories, public.products, public.product_variants
  from public, anon, authenticated;
revoke insert, update, delete on public.inventory, public.inventory_movements
  from public, anon, authenticated;

alter policy products_public_select on public.products
  using (status = 'active'::public.product_status and exists (
    select 1 from public.categories c where c.id = category_id and c.is_active
  ));

create function private.check_catalog_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.product_variants v
    where v.product_id = new.id and v.status = 'active'
  ) then
    raise exception 'Agrega una variante activa antes de publicar el producto' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_catalog_publication() from public, anon, authenticated;
create trigger products_check_publication
  before insert or update of status on public.products
  for each row execute function private.check_catalog_publication();

create function public.admin_catalog_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_admin();
$$;
revoke all on function public.admin_catalog_access() from public, anon;
grant execute on function public.admin_catalog_access() to authenticated;

-- The elevated portion is private (not exposed by PostgREST), has a fixed
-- search_path and rechecks the actor on every call. The API wrapper is invoker.
create function private.record_inventory_movement(
  p_variant_id uuid, p_operation_id uuid, p_direction text,
  p_quantity numeric, p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_stock integer;
  v_delta integer;
  v_type public.inventory_movement_type;
  v_previous public.inventory_movements%rowtype;
  v_result public.inventory_movements%rowtype;
begin
  if v_actor is null or not (select private.is_admin()) then
    raise exception 'Solo un administrador activo puede modificar el inventario' using errcode = '42501';
  end if;
  if p_variant_id is null or p_operation_id is null
     or p_direction is null or p_direction not in ('in', 'out')
     or p_quantity is null or p_quantity not between 1 and 1000000
     or p_quantity <> trunc(p_quantity)
     or p_reason is null or char_length(btrim(p_reason)) not between 5 and 250 then
    raise exception 'Cantidad entera entre 1 y 1000000 y motivo de 5 a 250 caracteres requeridos' using errcode = '22023';
  end if;
  v_delta := case when p_direction = 'in' then p_quantity::integer else -p_quantity::integer end;
  v_type := case when p_direction = 'in' then 'purchase'::public.inventory_movement_type
                 else 'adjustment'::public.inventory_movement_type end;

  -- Serialize retries even if a caller reuses the UUID for another variant.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_previous from public.inventory_movements where operation_id = p_operation_id;
  if found then
    if v_previous.product_variant_id <> p_variant_id or v_previous.created_by <> v_actor
       or v_previous.quantity_delta <> v_delta or v_previous.movement_type <> v_type
       or v_previous.reason <> btrim(p_reason) then
      raise exception 'La operación ya existe con datos diferentes' using errcode = '22023';
    end if;
    return to_jsonb(v_previous);
  end if;

  -- Lock the selected catalog entries against concurrent deactivation.
  perform v.id from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where v.id = p_variant_id and v.status = 'active' and p.status = 'active' and c.is_active
    for share of v, p, c;
  if not found then
    raise exception 'La variante, el producto y la categoría deben estar activos' using errcode = '22023';
  end if;
  select quantity_available into v_stock from public.inventory
    where product_variant_id = p_variant_id for update;
  if not found then raise exception 'Inventario no encontrado' using errcode = '22023'; end if;
  if v_stock::bigint + v_delta < 0 then
    raise exception 'Stock insuficiente. Disponible: %', v_stock using errcode = '22023';
  end if;
  if v_stock::bigint + v_delta > 2147483647 then
    raise exception 'El saldo excede el límite permitido' using errcode = '22023';
  end if;
  update public.inventory set quantity_available = v_stock + v_delta
    where product_variant_id = p_variant_id;
  insert into public.inventory_movements
    (product_variant_id, operation_id, movement_type, quantity_delta, quantity_after, reason, created_by)
  values (p_variant_id, p_operation_id, v_type, v_delta, v_stock + v_delta, btrim(p_reason), v_actor)
  returning * into v_result;
  return to_jsonb(v_result);
end;
$$;
revoke all on function private.record_inventory_movement(uuid, uuid, text, numeric, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.record_inventory_movement(uuid, uuid, text, numeric, text) to authenticated;

create function public.admin_record_inventory_movement(
  p_variant_id uuid, p_operation_id uuid, p_direction text,
  p_quantity numeric, p_reason text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.record_inventory_movement(p_variant_id, p_operation_id, p_direction, p_quantity, p_reason);
$$;
revoke all on function public.admin_record_inventory_movement(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.admin_record_inventory_movement(uuid, uuid, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
