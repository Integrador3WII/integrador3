begin;

create or replace function public.customer_catalog()
returns table (
  variant_id uuid, product_name text, description text, category text, size text, color text,
  base_price numeric, min_quantity integer, max_quantity integer, allows_customization boolean
)
language sql stable security definer set search_path = '' as $$
  select v.id, p.name, p.description, c.name, v.size_code, v.color_name,
    v.base_price, p.min_order_quantity, p.max_order_quantity, p.allows_customization
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.status = 'active'
  join public.categories c on c.id = p.category_id and c.is_active
  where v.status = 'active'
  order by c.name, p.name, v.color_name, v.size_code, v.id;
$$;

create or replace function public.customer_request_quote(
  p_request_id uuid, p_lines jsonb, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := auth.uid();
  v_notes text := nullif(trim(p_notes), '');
  v_id uuid;
  v_quote public.quotes%rowtype;
  v_requested jsonb;
  v_saved jsonb;
begin
  if not (select private.is_customer()) then
    raise exception 'Se requiere una cuenta de cliente activa' using errcode = '42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_lines) is distinct from 'array'
    or coalesce(char_length(v_notes), 0) > 500 then
    raise exception 'Revisa los datos de la solicitud' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception 'Agrega entre 1 y 30 variantes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_id uuid, quantity integer)
    group by variant_id
    having variant_id is null or count(*) > 1
      or bool_or(quantity is null or quantity not between 1 and 100000)
  ) then
    raise exception 'Las variantes deben ser únicas y tener cantidades válidas' using errcode = '22023';
  end if;

  insert into public.quotes (id, customer_id, customer_notes)
  values (p_request_id, v_customer, v_notes)
  on conflict (id) do nothing returning id into v_id;
  if v_id is null then
    select * into v_quote from public.quotes where id = p_request_id;
    if v_quote.customer_id is distinct from v_customer then
      raise exception 'Identificador de solicitud no disponible' using errcode = '42501';
    end if;
    select jsonb_object_agg(variant_id, quantity) into v_requested
    from jsonb_to_recordset(p_lines) as x(variant_id uuid, quantity integer);
    select jsonb_object_agg(product_variant_id, quantity) into v_saved
    from public.quote_items where quote_id = p_request_id;
    if v_saved is distinct from v_requested or v_quote.customer_notes is distinct from v_notes then
      raise exception 'El identificador ya se usó con otra solicitud' using errcode = '22023';
    end if;
    return p_request_id;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_id uuid, quantity integer)
    left join public.customer_catalog() c on c.variant_id = x.variant_id
    where c.variant_id is null
  ) then
    raise exception 'Alguna variante ya no está disponible' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_id uuid, quantity integer)
    join public.product_variants v on v.id = x.variant_id
    join public.products p on p.id = v.product_id
    group by p.id, p.min_order_quantity, p.max_order_quantity
    having sum(x.quantity) < p.min_order_quantity
      or (p.max_order_quantity is not null and sum(x.quantity) > p.max_order_quantity)
  ) then
    raise exception 'La cantidad de un producto está fuera del rango del catálogo' using errcode = '22023';
  end if;

  insert into public.quote_items (quote_id, product_variant_id, quantity)
  select v_id, variant_id, quantity
  from jsonb_to_recordset(p_lines) as x(variant_id uuid, quantity integer);
  perform public.submit_quote(v_id);
  return v_id;
end;
$$;

create or replace function public.customer_activity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_customer uuid := auth.uid();
  v_quotes jsonb;
  v_orders jsonb;
begin
  if not (select private.is_customer()) then
    raise exception 'Se requiere una cuenta de cliente activa' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb)
  into v_quotes
  from (
    select q.id, q.quote_number, q.status, q.valid_until, q.created_at, q.customer_notes,
      case when q.sent_at is not null then t.total end as total,
      (select jsonb_agg(jsonb_build_object(
        'name', p.name, 'color', v.color_name, 'size', v.size_code, 'quantity', i.quantity
      ) order by i.id)
      from public.quote_items i
      join public.product_variants v on v.id = i.product_variant_id
      join public.products p on p.id = v.product_id
      where i.quote_id = q.id) as items
    from public.quotes q
    left join public.v_quote_totals t on t.id = q.id
    where q.customer_id = v_customer and q.status <> 'draft'
    order by q.created_at desc, q.id desc limit 50
  ) r;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb)
  into v_orders
  from (
    select o.id, o.order_number, o.status, o.total, o.created_at, o.delivery_method,
      (select jsonb_agg(jsonb_build_object(
        'name', i.product_name_snapshot, 'color', i.color_snapshot,
        'size', i.size_snapshot, 'quantity', i.quantity
      ) order by i.id) from public.order_items i where i.order_id = o.id) as items
    from public.orders o where o.customer_id = v_customer
    order by o.created_at desc, o.id desc limit 50
  ) r;

  return jsonb_build_object('quotes', v_quotes, 'orders', v_orders);
end;
$$;

revoke all on function public.customer_catalog() from public, anon, authenticated;
grant execute on function public.customer_catalog() to anon, authenticated;
revoke all on function public.customer_request_quote(uuid, jsonb, text), public.customer_activity()
from public, anon, authenticated;
grant execute on function public.customer_request_quote(uuid, jsonb, text), public.customer_activity()
to authenticated;
notify pgrst, 'reload schema';

commit;
