-- SCRUM-12 / SCRUM-32. Preserve existing rules and prohibit terminal-state reopening.
CREATE OR REPLACE FUNCTION private.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_record_id := coalesce(v_old->>'id',v_old->>'product_variant_id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id',v_new->>'product_variant_id')::uuid;
  else
    v_old := null;
    v_new := to_jsonb(new);
    v_record_id := coalesce(v_new->>'id',v_new->>'product_variant_id')::uuid;
  end if;

  insert into public.audit_logs (
    actor_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    (select auth.uid()),
    tg_table_name,
    v_record_id,
    tg_op,
    v_old,
    v_new
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      (select auth.uid()),
      case when tg_op='UPDATE' then nullif(current_setting('app.order_transition_note',true),'') end
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.transition_order_status(p_order_id uuid, p_new_status order_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_latest_quality public.quality_result;
begin
  if not (select private.is_staff()) then
    raise exception 'Solo el personal autorizado puede actualizar pedidos';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status = p_new_status then
    return;
  end if;

  if p_new_status is null or not (
    (v_order.status = 'confirmed' and p_new_status in ('in_production','cancelled')) or
    (v_order.status = 'in_production' and p_new_status = 'quality_check') or
    (v_order.status = 'quality_check' and p_new_status in ('in_production','ready')) or
    (v_order.status = 'ready' and p_new_status = 'delivered')
  ) then raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status using errcode='22023'; end if;
  if char_length(coalesce(trim(p_note),'')) > 500 then
    raise exception 'La observación no puede superar 500 caracteres' using errcode='22023';
  end if;
  if p_new_status='cancelled' and (not private.is_admin() or char_length(coalesce(trim(p_note),'')) < 5) then
    raise exception 'La cancelación requiere administrador y motivo de al menos 5 caracteres' using errcode='22023';
  end if;

  if p_new_status = 'in_production'
     and v_order.status <> 'confirmed'
     and v_order.status <> 'quality_check' then
    raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status;
  end if;

  if p_new_status = 'quality_check' then
    if v_order.status <> 'in_production' then
      raise exception 'El pedido debe estar en producción antes del control de calidad';
    end if;

    if exists (
      select 1
      from public.production_tasks pt
      where pt.order_id = p_order_id
        and pt.status <> 'completed'
    ) then
      raise exception 'No se puede enviar a calidad mientras existan tareas de producción incompletas';
    end if;
  end if;

  if p_new_status = 'ready' then
    if v_order.status <> 'quality_check' then
      raise exception 'El pedido debe estar en control de calidad';
    end if;

    select qc.result
      into v_latest_quality
    from public.quality_checks qc
    where qc.order_id = p_order_id
    order by qc.checked_at desc, qc.id
    limit 1;

    if v_latest_quality is distinct from 'approved'::public.quality_result then
      raise exception 'Se necesita un control de calidad aprobado';
    end if;
  end if;

  if p_new_status = 'delivered' and v_order.status <> 'ready' then
    raise exception 'Solo un pedido listo puede marcarse como entregado';
  end if;

  if p_new_status = 'cancelled' and v_order.status <> 'confirmed' then
    raise exception 'Solo se puede cancelar un pedido antes de iniciar producción';
  end if;

  if v_order.status = 'confirmed'
     and p_new_status not in ('in_production','cancelled') then
    raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status;
  end if;

  perform set_config('app.order_transition_note',coalesce(trim(p_note),''),true);
  update public.orders
  set
    status = p_new_status,
    confirmed_at = case when p_new_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    started_at = case when p_new_status = 'in_production' then coalesce(started_at, now()) else started_at end,
    ready_at = case when p_new_status = 'ready' then now() else ready_at end,
    delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    updated_at = now()
  where id = p_order_id;

  perform set_config('app.order_transition_note','',true);
  if p_new_status = 'cancelled' and v_order.inventory_released_at is null then
    perform i.product_variant_id from public.inventory i
      where i.product_variant_id in (select product_variant_id from public.order_items where order_id=p_order_id)
      order by i.product_variant_id for update;
    if exists (select 1 from public.order_items oi left join public.inventory i on i.product_variant_id=oi.product_variant_id
      where oi.order_id=p_order_id and i.product_variant_id is null) then
      raise exception 'Inventario incompleto; no se pudo cancelar el pedido';
    end if;
    update public.inventory i
    set quantity_available = i.quantity_available + x.quantity
    from (
      select product_variant_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_variant_id
    ) x
    where i.product_variant_id = x.product_variant_id;

    insert into public.inventory_movements (
      product_variant_id,
      movement_type,
      quantity_delta,
      reason,
      order_id,
      created_by
    )
    select
      product_variant_id,
      'release',
      quantity,
      'Devolución de stock por cancelación de pedido',
      p_order_id,
      (select auth.uid())
    from (
      select product_variant_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_variant_id
    ) x;

    update public.orders
    set inventory_released_at = now()
    where id = p_order_id;
  end if;

end;
$function$
;
CREATE OR REPLACE FUNCTION public.convert_quote_to_order(p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote public.quotes%rowtype;
  v_order_id uuid;
  v_existing_order uuid;
  v_order_item_id uuid;
  v_stock integer;
  v_item record;
  v_service record;
  v_delivery_address public.customer_addresses%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede convertir cotizaciones en pedidos';
  end if;

  select *
    into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if v_quote.id is null then
    raise exception 'Cotización no encontrada';
  end if;

  if v_quote.status <> 'approved' then
    raise exception 'La cotización debe estar aprobada por el cliente';
  end if;

  select id into v_existing_order
  from public.orders
  where quote_id = p_quote_id;

  if v_existing_order is not null then
    return v_existing_order;
  end if;

  if v_quote.valid_until is not null and v_quote.valid_until < (now() at time zone 'America/La_Paz')::date then
    raise exception 'La cotización está vencida';
  end if;

  if not exists(select 1 from public.quote_items where quote_id=p_quote_id) then
    raise exception 'La cotización debe tener prendas';
  end if;
  -- Lock inventory in a deterministic order before any reservation.
  perform i.product_variant_id from public.inventory i
  where i.product_variant_id in (select product_variant_id from public.quote_items where quote_id=p_quote_id)
  order by i.product_variant_id for update;
  if v_quote.delivery_method = 'delivery' then
    if v_quote.delivery_address_id is null then
      raise exception 'El pedido de entrega necesita una dirección';
    end if;

    select * into v_delivery_address
    from public.customer_addresses
    where id = v_quote.delivery_address_id
      and customer_id = v_quote.customer_id;

    if v_delivery_address.id is null then
      raise exception 'La dirección de entrega no es válida';
    end if;
  end if;

  insert into public.orders (
    quote_id,
    customer_id,
    status,
    delivery_method,
    shipping_recipient_name,
    shipping_phone,
    shipping_address,
    shipping_neighborhood,
    shipping_city,
    shipping_department,
    shipping_reference,
    discount_amount,
    shipping_amount,
    customer_notes,
    admin_notes
  )
  values (
    v_quote.id,
    v_quote.customer_id,
    'confirmed',
    v_quote.delivery_method,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.recipient_name end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.phone end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.address_line end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.neighborhood end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.city end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.department end,
    case when v_quote.delivery_method = 'delivery' then v_delivery_address.reference end,
    v_quote.discount_amount,
    v_quote.shipping_amount,
    v_quote.customer_notes,
    v_quote.admin_notes
  )
  returning id into v_order_id;

  for v_item in
    select
      vqi.*,
      p.name as product_name,
      pv.sku,
      pv.color_name,
      pv.size_code,
      d.design_data,
      d.preview_path
    from public.v_quote_item_pricing vqi
    join public.product_variants pv
      on pv.id = vqi.product_variant_id
    join public.products p
      on p.id = pv.product_id
    left join public.designs d
      on d.id = vqi.design_id
    where vqi.quote_id = p_quote_id
    order by vqi.id
  loop
    select quantity_available
      into v_stock
    from public.inventory
    where product_variant_id = v_item.product_variant_id
    for update;

    if v_stock is null then
      raise exception 'La variante % no tiene inventario configurado', v_item.sku;
    end if;

    if v_stock < v_item.quantity then
      raise exception 'Stock insuficiente para SKU %. Disponible: %, solicitado: %',
        v_item.sku, v_stock, v_item.quantity;
    end if;

    insert into public.order_items (
      order_id,
      product_variant_id,
      design_id,
      product_name_snapshot,
      sku_snapshot,
      color_snapshot,
      size_snapshot,
      design_data_snapshot,
      preview_path_snapshot,
      quantity,
      unit_price,
      customization_total
    )
    values (
      v_order_id,
      v_item.product_variant_id,
      v_item.design_id,
      v_item.product_name,
      v_item.sku,
      v_item.color_name,
      v_item.size_code,
      v_item.design_data,
      v_item.preview_path,
      v_item.quantity,
      v_item.unit_price,
      v_item.customization_total
    )
    returning id into v_order_item_id;

    for v_service in
      select
        qis.service_id,
        cs.name,
        coalesce(qis.pricing_mode_snapshot, cs.pricing_mode) as pricing_mode,
        qis.units,
        coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) as unit_price,
        case coalesce(qis.pricing_mode_snapshot, cs.pricing_mode)
          when 'flat' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price)
          when 'per_item' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * v_item.quantity
          when 'per_unit' then
            coalesce(qis.unit_price_override, qis.unit_price_snapshot, cs.unit_price) * qis.units
        end as amount
      from public.quote_item_services qis
      join public.customization_services cs
        on cs.id = qis.service_id
      where qis.quote_item_id = v_item.id
    loop
      insert into public.order_item_services (
        order_item_id,
        service_id,
        service_name_snapshot,
        pricing_mode_snapshot,
        units,
        unit_price,
        amount
      )
      values (
        v_order_item_id,
        v_service.service_id,
        v_service.name,
        v_service.pricing_mode,
        v_service.units,
        v_service.unit_price,
        v_service.amount
      );
    end loop;

    update public.inventory
    set
      quantity_available = quantity_available - v_item.quantity,
      updated_at = now()
    where product_variant_id = v_item.product_variant_id;

    insert into public.inventory_movements (
      product_variant_id,
      movement_type,
      quantity_delta,
      reason,
      order_id,
      created_by
    )
    values (
      v_item.product_variant_id,
      'sale',
      -v_item.quantity,
      'Reserva/descuento de stock al convertir cotización en pedido',
      v_order_id,
      (select auth.uid())
    );
  end loop;

  return v_order_id;
end;
$function$
;
revoke insert,update,delete on public.orders,public.order_items,public.order_item_services,public.order_status_history from public,anon,authenticated;
revoke all on function public.transition_order_status(uuid,public.order_status,text),public.convert_quote_to_order(uuid) from public,anon;
grant execute on function public.transition_order_status(uuid,public.order_status,text),public.convert_quote_to_order(uuid) to authenticated;

-- Freeze sent offers and serialize every item edit with the parent quote lock.
create or replace function private.guard_quote_item_edit()
returns trigger language plpgsql set search_path='' as $$
declare v_quote uuid; v_status public.quote_status; v_parent uuid;
begin
  if tg_table_name='quote_items' then
    if tg_op='UPDATE' and new.quote_id is distinct from old.quote_id then raise exception 'No se puede trasladar una prenda a otra cotización'; end if;
    v_quote := case when tg_op='DELETE' then old.quote_id else new.quote_id end;
  else
    if tg_op='UPDATE' and new.quote_item_id is distinct from old.quote_item_id then raise exception 'No se puede trasladar un servicio a otra prenda'; end if;
    v_parent := case when tg_op='DELETE' then old.quote_item_id else new.quote_item_id end;
    select quote_id into v_quote from public.quote_items where id=v_parent;
  end if;
  select status into v_status from public.quotes where id=v_quote for update;
  if v_status is null or v_status not in ('draft','submitted','under_review') then
    raise exception 'La oferta enviada es inmutable; no se pueden cambiar sus prendas ni servicios' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger quote_items_freeze before insert or update or delete on public.quote_items for each row execute function private.guard_quote_item_edit();
create trigger quote_services_freeze before insert or update or delete on public.quote_item_services for each row execute function private.guard_quote_item_edit();

create or replace function private.guard_sent_quote()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and new.status is distinct from old.status then
    raise exception 'Utiliza las acciones autorizadas para cambiar el estado' using errcode='42501';
  end if;
  if old.status in ('sent','approved','rejected','expired','cancelled') then
    if (to_jsonb(new)-array['status','responded_at','updated_at']) is distinct from (to_jsonb(old)-array['status','responded_at','updated_at']) then
      raise exception 'La oferta enviada no se puede modificar' using errcode='22023';
    end if;
    if new.status is distinct from old.status and not (old.status='sent' and new.status in ('approved','rejected','expired')) then
      raise exception 'No se puede reabrir una oferta finalizada' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
create trigger quotes_freeze before update on public.quotes for each row execute function private.guard_sent_quote();

create or replace function public.admin_send_quote(p_quote_id uuid,p_items jsonb,p_discount numeric,p_shipping numeric,p_valid_until date)
returns void language plpgsql security definer set search_path='' as $$
declare v_quote public.quotes%rowtype; v_subtotal numeric; v_count integer;
begin
  if not private.is_admin() then raise exception 'Se requiere administrador activo' using errcode='42501'; end if;
  select * into v_quote from public.quotes where id=p_quote_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada' using errcode='22023'; end if;
  if v_quote.status not in ('submitted','under_review') then raise exception 'Solo se puede valorar una solicitud recibida o en revisión' using errcode='22023'; end if;
  if p_discount is null or p_shipping is null or p_discount<0 or p_shipping<0
    or p_discount::text in ('NaN','Infinity','-Infinity') or p_shipping::text in ('NaN','Infinity','-Infinity')
    or p_discount<>round(p_discount,2) or p_shipping<>round(p_shipping,2) then
    raise exception 'Los importes deben ser no negativos y tener como máximo dos decimales' using errcode='22023';
  end if;
  if p_valid_until is null or p_valid_until < (now() at time zone 'America/La_Paz')::date then raise exception 'La vigencia no puede estar vencida' using errcode='22023'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Prendas inválidas' using errcode='22023'; end if;
  select count(*) into v_count from public.quote_items where quote_id=p_quote_id;
  if v_count=0 or jsonb_array_length(p_items)<>v_count then raise exception 'Incluye todas las prendas de la cotización' using errcode='22023'; end if;
  if (select count(distinct id) from jsonb_to_recordset(p_items) as x(id uuid,unit_price numeric))<>v_count
    or exists(select 1 from jsonb_to_recordset(p_items) as x(id uuid,unit_price numeric)
      left join public.quote_items qi on qi.id=x.id and qi.quote_id=p_quote_id
      where qi.id is null or x.unit_price is null or x.unit_price<0 or x.unit_price::text in ('NaN','Infinity','-Infinity') or x.unit_price<>round(x.unit_price,2)) then
    raise exception 'Cada prenda debe tener un precio válido y aparecer una sola vez' using errcode='22023';
  end if;
  update public.quote_items qi set unit_price_snapshot=x.unit_price,unit_price_override=null
    from jsonb_to_recordset(p_items) as x(id uuid,unit_price numeric) where qi.id=x.id and qi.quote_id=p_quote_id;
  update public.quote_item_services qis set pricing_mode_snapshot=coalesce(qis.pricing_mode_snapshot,cs.pricing_mode),
    unit_price_snapshot=coalesce(qis.unit_price_override,qis.unit_price_snapshot,cs.unit_price),unit_price_override=null
    from public.customization_services cs where cs.id=qis.service_id and qis.quote_item_id in (select id from public.quote_items where quote_id=p_quote_id);
  select coalesce(sum(line_total),0) into v_subtotal from public.v_quote_item_pricing where quote_id=p_quote_id;
  if p_discount>v_subtotal then raise exception 'El descuento no puede superar el subtotal' using errcode='22023'; end if;
  update public.quotes set discount_amount=p_discount,shipping_amount=p_shipping,valid_until=p_valid_until,status='sent',sent_at=now() where id=p_quote_id;
end $$;
revoke all on function public.admin_send_quote(uuid,jsonb,numeric,numeric,date) from public,anon;
grant execute on function public.admin_send_quote(uuid,jsonb,numeric,numeric,date) to authenticated;
CREATE OR REPLACE FUNCTION public.respond_to_quote(p_quote_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid;
  v_status public.quote_status;
begin
  if auth.uid() is null or p_approve is null or not exists(select 1 from public.profiles where id=auth.uid() and is_active) then raise exception 'Se requiere una cuenta activa' using errcode='42501'; end if;
  select customer_id, status
    into v_customer_id, v_status
  from public.quotes
  where id = p_quote_id for update;

  if v_customer_id is null then
    raise exception 'Cotización no encontrada';
  end if;

  if v_customer_id <> (select auth.uid()) then
    raise exception 'No puedes responder esta cotización';
  end if;

  if v_status <> 'sent' then
    raise exception 'La cotización no está pendiente de respuesta';
  end if;

  if exists(select 1 from public.quotes where id=p_quote_id and valid_until < (now() at time zone 'America/La_Paz')::date) then
    raise exception 'La cotización está vencida' using errcode='22023';
  end if;
  update public.quotes
  set
    status = (case when p_approve then 'approved' else 'rejected' end)::public.quote_status,
    responded_at = now()
  where id = p_quote_id;
end;
$function$
;
revoke all on function public.respond_to_quote(uuid,boolean) from public,anon;
grant execute on function public.respond_to_quote(uuid,boolean) to authenticated;
