-- Raw material balances, immutable movement ledger, and versioned garment recipes.
-- Finished-garment inventory remains intact for variants fulfilled from stock.
begin;

alter table public.product_variants add column if not exists fulfillment_mode text not null default 'stock'
  check (fulfillment_mode in ('stock','made_to_order'));

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9._-]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  unit text not null check (unit in ('m','m2','kg','g','l','ml','unit')),
  description text,
  is_active boolean not null default true,
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved numeric(14,3) not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand),
  reorder_point numeric(14,3) not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  movement_type text not null check (movement_type in ('receipt','adjustment_in','adjustment_out','reserve','release','consume','waste')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0 or movement_type = 'consume'),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reason text not null check (char_length(trim(reason)) between 5 and 250),
  order_id uuid references public.orders(id),
  operation_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (operation_id)
);
create index if not exists material_movements_material_created_idx on public.material_movements(material_id, created_at desc);
create index if not exists material_movements_order_idx on public.material_movements(order_id) where order_id is not null;

create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(product_variant_id, version)
);
create unique index if not exists product_recipes_one_active_idx on public.product_recipes(product_variant_id) where status = 'active';

create table if not exists public.product_recipe_materials (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.product_recipes(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  quantity_per_unit numeric(14,4) not null check (quantity_per_unit > 0),
  waste_percent numeric(5,2) not null default 0 check (waste_percent between 0 and 100),
  unique(recipe_id, material_id)
);

create table if not exists public.order_material_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  recipe_id uuid not null references public.product_recipes(id),
  material_id uuid not null references public.materials(id),
  material_name_snapshot text not null,
  unit_snapshot text not null,
  planned_quantity numeric(14,3) not null check (planned_quantity > 0),
  reserved_quantity numeric(14,3) not null check (reserved_quantity >= 0),
  consumed_quantity numeric(14,3) not null default 0 check (consumed_quantity >= 0),
  created_at timestamptz not null default now(),
  unique(order_item_id, material_id)
);
create index if not exists order_material_requirements_order_idx on public.order_material_requirements(order_id);

alter table public.materials enable row level security;
alter table public.material_movements enable row level security;
alter table public.product_recipes enable row level security;
alter table public.product_recipe_materials enable row level security;
alter table public.order_material_requirements enable row level security;

drop policy if exists materials_staff_read on public.materials;
create policy materials_staff_read on public.materials for select to authenticated using ((select private.is_staff()));
drop policy if exists material_movements_staff_read on public.material_movements;
create policy material_movements_staff_read on public.material_movements for select to authenticated using ((select private.is_staff()));
drop policy if exists product_recipes_staff_read on public.product_recipes;
create policy product_recipes_staff_read on public.product_recipes for select to authenticated using ((select private.is_staff()));
drop policy if exists product_recipe_materials_staff_read on public.product_recipe_materials;
create policy product_recipe_materials_staff_read on public.product_recipe_materials for select to authenticated using ((select private.is_staff()));
drop policy if exists order_material_requirements_staff_read on public.order_material_requirements;
create policy order_material_requirements_staff_read on public.order_material_requirements for select to authenticated using ((select private.is_staff()));

revoke all on public.materials, public.material_movements, public.product_recipes,
  public.product_recipe_materials, public.order_material_requirements from anon, authenticated;
grant select on public.materials, public.material_movements, public.product_recipes,
  public.product_recipe_materials, public.order_material_requirements to authenticated;

create or replace function public.admin_create_material(
  p_code text, p_name text, p_unit text, p_reorder_point numeric default 0, p_description text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden crear materiales' using errcode='42501'; end if;
  insert into public.materials(code,name,unit,reorder_point,description)
  values (upper(trim(p_code)),trim(p_name),p_unit,p_reorder_point,nullif(trim(p_description),'')) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_receive_material(
  p_material_id uuid, p_operation_id uuid, p_quantity numeric, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_material public.materials%rowtype; v_movement public.material_movements%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden registrar recepciones' using errcode='42501'; end if;
  if p_operation_id is null or p_quantity <= 0 or p_quantity > 1000000 or char_length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Revisa cantidad, motivo e identificador de operación' using errcode='22023'; end if;
  select * into v_material from public.materials where id=p_material_id for update;
  if v_material.id is null or not v_material.is_active then raise exception 'Material no disponible' using errcode='22023'; end if;
  select * into v_movement from public.material_movements where operation_id=p_operation_id;
  if v_movement.id is not null then
    if v_movement.material_id<>p_material_id or v_movement.quantity_delta<>p_quantity or v_movement.reason<>trim(p_reason) then
      raise exception 'El identificador ya fue usado para otra recepción' using errcode='22023'; end if;
    return to_jsonb(v_movement);
  end if;
  update public.materials set quantity_on_hand=quantity_on_hand+p_quantity,updated_at=now() where id=p_material_id returning * into v_material;
  insert into public.material_movements(material_id,movement_type,quantity_delta,quantity_after,reason,operation_id,created_by)
  values(p_material_id,'receipt',p_quantity,v_material.quantity_on_hand-v_material.quantity_reserved,trim(p_reason),p_operation_id,(select auth.uid())) returning * into v_movement;
  return to_jsonb(v_movement);
end; $$;

create or replace function public.admin_save_recipe(p_variant_id uuid,p_lines jsonb,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_recipe uuid; v_version integer; v_line jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden editar recetas' using errcode='42501'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>50 then raise exception 'La receta debe incluir entre 1 y 50 materiales' using errcode='22023'; end if;
  if not exists(select 1 from public.product_variants where id=p_variant_id) then raise exception 'Variante no encontrada' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x(material_id uuid,quantity_per_unit numeric,waste_percent numeric)
    where material_id is null or quantity_per_unit<=0 or coalesce(waste_percent,0)<0 or coalesce(waste_percent,0)>100) then raise exception 'Revisa cantidades y merma de la receta' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x(material_id uuid,quantity_per_unit numeric,waste_percent numeric)
    left join public.materials m on m.id=x.material_id and m.is_active where m.id is null) then raise exception 'La receta contiene materiales inactivos o inexistentes' using errcode='22023'; end if;
  perform 1 from public.product_recipes where product_variant_id=p_variant_id and status='active' for update;
  select coalesce(max(version),0)+1 into v_version from public.product_recipes where product_variant_id=p_variant_id;
  update public.product_recipes set status='retired' where product_variant_id=p_variant_id and status='active';
  insert into public.product_recipes(product_variant_id,version,status,notes,created_by)
    values(p_variant_id,v_version,'active',nullif(trim(p_notes),''),(select auth.uid())) returning id into v_recipe;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.product_recipe_materials(recipe_id,material_id,quantity_per_unit,waste_percent)
    values(v_recipe,(v_line->>'material_id')::uuid,(v_line->>'quantity_per_unit')::numeric,coalesce((v_line->>'waste_percent')::numeric,0));
  end loop;
  return v_recipe;
end; $$;

create or replace function public.admin_set_variant_fulfillment(p_variant_id uuid,p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden cambiar el modo de cumplimiento' using errcode='42501'; end if;
  if p_mode not in ('stock','made_to_order') then raise exception 'Modo de producción no válido' using errcode='22023'; end if;
  if p_mode='made_to_order' and not exists(select 1 from public.product_recipes where product_variant_id=p_variant_id and status='active') then
    raise exception 'Publica una receta activa antes de habilitar fabricación bajo pedido' using errcode='22023'; end if;
  update public.product_variants set fulfillment_mode=p_mode where id=p_variant_id;
  if not found then raise exception 'Variante no encontrada' using errcode='22023'; end if;
end; $$;

-- Reserve raw materials atomically while the quote becomes an order.
create or replace function private.reserve_order_item_materials(p_order_id uuid,p_order_item_id uuid,p_variant_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_recipe public.product_recipes%rowtype; v_line record; v_required numeric(14,3); v_material public.materials%rowtype;
begin
  if not exists(select 1 from public.product_variants where id=p_variant_id and fulfillment_mode='made_to_order') then return; end if;
  select * into v_recipe from public.product_recipes where product_variant_id=p_variant_id and status='active' for share;
  if v_recipe.id is null then raise exception 'La variante requiere una receta activa antes de aceptar pedidos' using errcode='22023'; end if;
  for v_line in
    select prm.material_id,prm.quantity_per_unit,prm.waste_percent,m.name,m.unit
    from public.product_recipe_materials prm join public.materials m on m.id=prm.material_id
    where prm.recipe_id=v_recipe.id and m.is_active order by prm.material_id
  loop
    v_required := ceil((p_quantity * v_line.quantity_per_unit * (1 + v_line.waste_percent/100)) * 1000) / 1000;
    select * into v_material from public.materials where id=v_line.material_id for update;
    if v_material.quantity_on_hand-v_material.quantity_reserved < v_required then
      raise exception 'Material insuficiente: %. Disponible: %, requerido: % %',v_line.name,
        v_material.quantity_on_hand-v_material.quantity_reserved,v_required,v_line.unit using errcode='22023';
    end if;
    update public.materials set quantity_reserved=quantity_reserved+v_required,updated_at=now() where id=v_line.material_id returning * into v_material;
    insert into public.order_material_requirements(order_id,order_item_id,recipe_id,material_id,material_name_snapshot,unit_snapshot,planned_quantity,reserved_quantity)
    values(p_order_id,p_order_item_id,v_recipe.id,v_line.material_id,v_line.name,v_line.unit,v_required,v_required);
    insert into public.material_movements(material_id,movement_type,quantity_delta,quantity_after,reason,order_id,created_by)
    values(v_line.material_id,'reserve',-v_required,v_material.quantity_on_hand-v_material.quantity_reserved,
      'Reserva para producción bajo pedido',p_order_id,(select auth.uid()));
  end loop;
end; $$;

create or replace function private.finish_order_materials(p_order_id uuid,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req record; v_material public.materials%rowtype; v_remaining numeric(14,3);
begin
  if p_action not in ('consume','release') then raise exception 'Acción de materiales inválida'; end if;
  for v_req in select * from public.order_material_requirements where order_id=p_order_id and reserved_quantity>0 order by material_id for update loop
    select * into v_material from public.materials where id=v_req.material_id for update;
    if p_action='consume' then
      v_remaining:=v_req.reserved_quantity;
      update public.materials set quantity_reserved=quantity_reserved-v_remaining,quantity_on_hand=quantity_on_hand-v_remaining,updated_at=now() where id=v_req.material_id returning * into v_material;
      update public.order_material_requirements set consumed_quantity=consumed_quantity+v_remaining,reserved_quantity=0 where id=v_req.id;
      insert into public.material_movements(material_id,movement_type,quantity_delta,quantity_after,reason,order_id,created_by)
      values(v_req.material_id,'consume',0,v_material.quantity_on_hand-v_material.quantity_reserved,'Consumo al iniciar producción',p_order_id,(select auth.uid()));
    else
      update public.materials set quantity_reserved=quantity_reserved-v_req.reserved_quantity,updated_at=now() where id=v_req.material_id returning * into v_material;
      insert into public.material_movements(material_id,movement_type,quantity_delta,quantity_after,reason,order_id,created_by)
      values(v_req.material_id,'release',v_req.reserved_quantity,v_material.quantity_on_hand-v_material.quantity_reserved,
        coalesce(nullif(trim(p_note),''),'Liberación por cancelación previa a producción'),p_order_id,(select auth.uid()));
      update public.order_material_requirements set reserved_quantity=0 where id=v_req.id;
    end if;
  end loop;
end; $$;

create or replace function private.sync_order_material_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='in_production' and old.status is distinct from new.status then perform private.finish_order_materials(new.id,'consume'); end if;
  if new.status='cancelled' and old.status is distinct from new.status then perform private.finish_order_materials(new.id,'release','Liberación por cancelación del pedido'); end if;
  return new;
end; $$;
drop trigger if exists orders_sync_material_status on public.orders;
create trigger orders_sync_material_status after update of status on public.orders for each row execute function private.sync_order_material_status();

-- Keep quote conversion semantics while allowing made-to-order variants to reserve
-- their recipe materials instead of requiring finished-garment stock.
create or replace function public.convert_quote_to_order(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype; v_order_id uuid; v_existing_order uuid; v_order_item_id uuid;
  v_stock integer; v_item record; v_service record; v_delivery_address public.customer_addresses%rowtype;
  v_mode text;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede convertir cotizaciones en pedidos' using errcode='42501'; end if;
  select * into v_quote from public.quotes where id=p_quote_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada'; end if;
  if v_quote.status<>'approved' then raise exception 'La cotización debe estar aprobada por el cliente'; end if;
  select id into v_existing_order from public.orders where quote_id=p_quote_id;
  if v_existing_order is not null then return v_existing_order; end if;
  if v_quote.valid_until is not null and v_quote.valid_until<(now() at time zone 'America/La_Paz')::date then raise exception 'La cotización está vencida'; end if;
  if not exists(select 1 from public.quote_items where quote_id=p_quote_id) then raise exception 'La cotización debe tener prendas'; end if;
  perform i.product_variant_id from public.inventory i where i.product_variant_id in (select product_variant_id from public.quote_items where quote_id=p_quote_id) order by i.product_variant_id for update;
  perform m.id from public.materials m where m.id in (select prm.material_id from public.quote_items qi join public.product_variants pv on pv.id=qi.product_variant_id and pv.fulfillment_mode='made_to_order' join public.product_recipes pr on pr.product_variant_id=pv.id and pr.status='active' join public.product_recipe_materials prm on prm.recipe_id=pr.id where qi.quote_id=p_quote_id) order by m.id for update;
  if v_quote.delivery_method='delivery' then
    if v_quote.delivery_address_id is null then raise exception 'El pedido de entrega necesita una dirección'; end if;
    select * into v_delivery_address from public.customer_addresses where id=v_quote.delivery_address_id and customer_id=v_quote.customer_id;
    if v_delivery_address.id is null then raise exception 'La dirección de entrega no es válida'; end if;
  end if;
  insert into public.orders(quote_id,customer_id,status,delivery_method,shipping_recipient_name,shipping_phone,shipping_address,shipping_neighborhood,shipping_city,shipping_department,shipping_reference,discount_amount,shipping_amount,customer_notes,admin_notes)
  values(v_quote.id,v_quote.customer_id,'confirmed',v_quote.delivery_method,
    case when v_quote.delivery_method='delivery' then v_delivery_address.recipient_name end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.phone end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.address_line end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.neighborhood end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.city end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.department end,
    case when v_quote.delivery_method='delivery' then v_delivery_address.reference end,
    v_quote.discount_amount,v_quote.shipping_amount,v_quote.customer_notes,v_quote.admin_notes) returning id into v_order_id;
  for v_item in
    select vqi.*,p.name product_name,pv.sku,pv.color_name,pv.size_code,pv.fulfillment_mode,d.design_data,d.preview_path
    from public.v_quote_item_pricing vqi join public.product_variants pv on pv.id=vqi.product_variant_id
    join public.products p on p.id=pv.product_id left join public.designs d on d.id=vqi.design_id
    where vqi.quote_id=p_quote_id order by vqi.id
  loop
    v_mode:=v_item.fulfillment_mode;
    if v_mode='stock' then
      select quantity_available into v_stock from public.inventory where product_variant_id=v_item.product_variant_id for update;
      if v_stock is null then raise exception 'La variante % no tiene inventario configurado',v_item.sku; end if;
      if v_stock<v_item.quantity then raise exception 'Stock insuficiente para SKU %. Disponible: %, solicitado: %',v_item.sku,v_stock,v_item.quantity; end if;
    elsif not exists(select 1 from public.product_recipes where product_variant_id=v_item.product_variant_id and status='active') then
      raise exception 'La variante % no tiene receta activa',v_item.sku using errcode='22023';
    end if;
    insert into public.order_items(order_id,product_variant_id,design_id,product_name_snapshot,sku_snapshot,color_snapshot,size_snapshot,design_data_snapshot,preview_path_snapshot,quantity,unit_price,customization_total)
    values(v_order_id,v_item.product_variant_id,v_item.design_id,v_item.product_name,v_item.sku,v_item.color_name,v_item.size_code,v_item.design_data,v_item.preview_path,v_item.quantity,v_item.unit_price,v_item.customization_total) returning id into v_order_item_id;
    if v_mode='made_to_order' then perform private.reserve_order_item_materials(v_order_id,v_order_item_id,v_item.product_variant_id,v_item.quantity); end if;
    for v_service in
      select qis.service_id,cs.name,coalesce(qis.pricing_mode_snapshot,cs.pricing_mode) pricing_mode,qis.units,
        coalesce(qis.unit_price_override,qis.unit_price_snapshot,cs.unit_price) unit_price,
        case coalesce(qis.pricing_mode_snapshot,cs.pricing_mode)
          when 'flat' then coalesce(qis.unit_price_override,qis.unit_price_snapshot,cs.unit_price)
          when 'per_item' then coalesce(qis.unit_price_override,qis.unit_price_snapshot,cs.unit_price)*v_item.quantity
          when 'per_unit' then coalesce(qis.unit_price_override,qis.unit_price_snapshot,cs.unit_price)*qis.units end amount
      from public.quote_item_services qis join public.customization_services cs on cs.id=qis.service_id where qis.quote_item_id=v_item.id
    loop
      insert into public.order_item_services(order_item_id,service_id,service_name_snapshot,pricing_mode_snapshot,units,unit_price,amount)
      values(v_order_item_id,v_service.service_id,v_service.name,v_service.pricing_mode,v_service.units,v_service.unit_price,v_service.amount);
    end loop;
    if v_mode='stock' then
      update public.inventory set quantity_available=quantity_available-v_item.quantity,updated_at=now() where product_variant_id=v_item.product_variant_id;
      insert into public.inventory_movements(product_variant_id,movement_type,quantity_delta,reason,order_id,created_by)
      values(v_item.product_variant_id,'sale',-v_item.quantity,'Salida de prenda terminada por pedido',v_order_id,(select auth.uid()));
    end if;
  end loop;
  return v_order_id;
end; $$;

create or replace function public.transition_order_status(p_order_id uuid,p_new_status public.order_status,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_latest_quality public.quality_result;
begin
  if not (select private.is_staff()) then raise exception 'Solo el personal autorizado puede actualizar pedidos' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido no encontrado'; end if;
  if v_order.status=p_new_status then return; end if;
  if p_new_status is null or not (
    (v_order.status='confirmed' and p_new_status in ('in_production','cancelled')) or
    (v_order.status='in_production' and p_new_status='quality_check') or
    (v_order.status='quality_check' and p_new_status in ('in_production','ready')) or
    (v_order.status='ready' and p_new_status='delivered')) then
    raise exception 'Transición no permitida: % -> %',v_order.status,p_new_status using errcode='22023'; end if;
  if char_length(coalesce(trim(p_note),''))>500 then raise exception 'La observación no puede superar 500 caracteres' using errcode='22023'; end if;
  if p_new_status='cancelled' and (not private.is_admin() or char_length(coalesce(trim(p_note),''))<5) then raise exception 'La cancelación requiere administrador y motivo de al menos 5 caracteres' using errcode='22023'; end if;
  if p_new_status='quality_check' and exists(select 1 from public.production_tasks where order_id=p_order_id and status<>'completed') then raise exception 'No se puede enviar a calidad mientras existan tareas de producción incompletas'; end if;
  if p_new_status='ready' then
    select result into v_latest_quality from public.quality_checks where order_id=p_order_id order by checked_at desc,id limit 1;
    if v_latest_quality is distinct from 'approved'::public.quality_result then raise exception 'Se necesita un control de calidad aprobado'; end if;
  end if;
  if p_new_status='cancelled' and v_order.status<>'confirmed' then raise exception 'Solo se puede cancelar un pedido antes de iniciar producción'; end if;
  perform set_config('app.order_transition_note',coalesce(trim(p_note),''),true);
  update public.orders set status=p_new_status,
    confirmed_at=case when p_new_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
    started_at=case when p_new_status='in_production' then coalesce(started_at,now()) else started_at end,
    ready_at=case when p_new_status='ready' then now() else ready_at end,
    delivered_at=case when p_new_status='delivered' then now() else delivered_at end,
    cancelled_at=case when p_new_status='cancelled' then now() else cancelled_at end,updated_at=now()
  where id=p_order_id;
  perform set_config('app.order_transition_note','',true);
  if p_new_status='cancelled' and v_order.inventory_released_at is null then
    perform i.product_variant_id from public.inventory i join public.product_variants pv on pv.id=i.product_variant_id
      where pv.fulfillment_mode='stock' and i.product_variant_id in (select product_variant_id from public.order_items where order_id=p_order_id)
      order by i.product_variant_id for update;
    update public.inventory i set quantity_available=i.quantity_available+x.quantity,updated_at=now()
      from (select oi.product_variant_id,sum(oi.quantity)::integer quantity from public.order_items oi join public.product_variants pv on pv.id=oi.product_variant_id
        where oi.order_id=p_order_id and pv.fulfillment_mode='stock' group by oi.product_variant_id) x
      where i.product_variant_id=x.product_variant_id;
    insert into public.inventory_movements(product_variant_id,movement_type,quantity_delta,reason,order_id,created_by)
      select x.product_variant_id,'release',x.quantity,'Devolución de prendas terminadas por cancelación',p_order_id,(select auth.uid())
      from (select oi.product_variant_id,sum(oi.quantity)::integer quantity from public.order_items oi join public.product_variants pv on pv.id=oi.product_variant_id
        where oi.order_id=p_order_id and pv.fulfillment_mode='stock' group by oi.product_variant_id) x;
    update public.orders set inventory_released_at=now() where id=p_order_id;
  end if;
end; $$;

revoke all on function public.admin_create_material(text,text,text,numeric,text), public.admin_receive_material(uuid,uuid,numeric,text), public.admin_save_recipe(uuid,jsonb,text), public.admin_set_variant_fulfillment(uuid,text) from public, anon;
grant execute on function public.admin_create_material(text,text,text,numeric,text), public.admin_receive_material(uuid,uuid,numeric,text), public.admin_save_recipe(uuid,jsonb,text), public.admin_set_variant_fulfillment(uuid,text) to authenticated;
revoke all on function private.reserve_order_item_materials(uuid,uuid,uuid,integer), private.finish_order_materials(uuid,text,text), private.sync_order_material_status() from public, anon, authenticated;
revoke all on function public.convert_quote_to_order(uuid) from public, anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;
revoke all on function public.transition_order_status(uuid,public.order_status,text) from public, anon;
grant execute on function public.transition_order_status(uuid,public.order_status,text) to authenticated;
notify pgrst, 'reload schema';
commit;
