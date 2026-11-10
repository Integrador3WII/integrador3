begin;

-- Serialize recipe publication with conversions before either locks materials.
create or replace function public.admin_save_recipe(p_variant_id uuid,p_lines jsonb,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_recipe uuid; v_version integer; v_line jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden editar recetas' using errcode='42501'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>50 then raise exception 'La receta debe incluir entre 1 y 50 materiales' using errcode='22023'; end if;
  perform 1 from public.product_variants where id=p_variant_id for no key update;
  if not found then raise exception 'Variante no encontrada' using errcode='22023'; end if;
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
  -- Keep fulfillment mode and the active recipe stable throughout conversion.
  perform v.id
  from public.product_variants v
  where v.id in (select product_variant_id from public.quote_items where quote_id=p_quote_id)
  order by v.id for share;
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

create or replace function private.restore_finished_order_stock(p_order_id uuid, p_legacy boolean)
returns void language plpgsql set search_path = '' as $$
declare
  v_item record;
begin
  for v_item in
    with sales as (
      select product_variant_id, -sum(quantity_delta)::integer as quantity
      from public.inventory_movements
      where order_id = p_order_id and movement_type = 'sale'
      group by product_variant_id
    )
    select product_variant_id, quantity from sales
    union all
    -- Older orders created outside quote conversion can lack a sale entry.
    select oi.product_variant_id, sum(oi.quantity)::integer
    from public.order_items oi
    where p_legacy and oi.order_id = p_order_id
      and not exists (select 1 from sales s where s.product_variant_id = oi.product_variant_id)
      and not exists (
        select 1 from public.order_material_requirements r where r.order_item_id = oi.id
      )
    group by oi.product_variant_id
    order by product_variant_id
  loop
    update public.inventory
    set quantity_available = quantity_available + v_item.quantity, updated_at = now()
    where product_variant_id = v_item.product_variant_id;
    if not found then
      raise exception 'No se puede devolver una variante sin inventario';
    end if;

    insert into public.inventory_movements (
      product_variant_id, movement_type, quantity_delta, reason, order_id, created_by
    ) values (
      v_item.product_variant_id, 'release', v_item.quantity,
      'Devolución de prendas terminadas por cancelación', p_order_id, (select auth.uid())
    );
  end loop;
end;
$$;

revoke all on function private.restore_finished_order_stock(uuid, boolean)
from public, anon, authenticated;

create or replace function public.transition_order_status(
  p_order_id uuid, p_new_status public.order_status, p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_latest_quality public.quality_result;
  v_note text := coalesce(trim(p_note), '');
begin
  if not (select private.is_staff()) then
    raise exception 'Solo el personal autorizado puede actualizar pedidos' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.status = p_new_status then return; end if;

  if p_new_status is null or not (
    (v_order.status = 'confirmed' and p_new_status in ('in_production', 'cancelled'))
    or (v_order.status = 'in_production' and p_new_status = 'quality_check')
    or (v_order.status = 'quality_check' and p_new_status in ('in_production', 'ready'))
    or (v_order.status = 'ready' and p_new_status = 'delivered')
  ) then
    raise exception 'Transición no permitida: % -> %', v_order.status, p_new_status using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'La observación no puede superar 500 caracteres' using errcode = '22023';
  end if;
  if p_new_status = 'cancelled' and (not private.is_admin() or char_length(v_note) < 5) then
    raise exception 'La cancelación requiere administrador y motivo de al menos 5 caracteres' using errcode = '22023';
  end if;
  if p_new_status = 'quality_check' and exists (
    select 1 from public.production_tasks where order_id = p_order_id and status <> 'completed'
  ) then
    raise exception 'No se puede enviar a calidad mientras existan tareas de producción incompletas';
  end if;
  if p_new_status = 'ready' then
    select result into v_latest_quality from public.quality_checks
    where order_id = p_order_id order by checked_at desc, id limit 1;
    if v_latest_quality is distinct from 'approved'::public.quality_result then
      raise exception 'Se necesita un control de calidad aprobado';
    end if;
  end if;

  perform set_config('app.order_transition_note', v_note, true);
  update public.orders set
    status = p_new_status,
    started_at = case when p_new_status = 'in_production' then coalesce(started_at, now()) else started_at end,
    ready_at = case when p_new_status = 'ready' then now() else ready_at end,
    delivered_at = case when p_new_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    updated_at = now()
  where id = p_order_id;
  perform set_config('app.order_transition_note', '', true);

  if p_new_status = 'cancelled' and v_order.inventory_released_at is null then
    perform private.restore_finished_order_stock(p_order_id, v_order.quote_id is null);
    update public.orders set inventory_released_at = now() where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.transition_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;
notify pgrst, 'reload schema';

commit;
