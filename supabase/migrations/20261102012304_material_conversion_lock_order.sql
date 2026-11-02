-- Ensure all raw-material rows are locked in deterministic order before conversion.
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


revoke all on function public.convert_quote_to_order(uuid) from public,anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;
notify pgrst,'reload schema';
