-- Keep existing order status gates while releasing finished garments only for
-- stock-fulfilled variants. Material reservations are handled by the status trigger.
create or replace function public.transition_order_status(p_order_id uuid,p_new_status public.order_status,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_latest_quality public.quality_result;
begin
  if not (select private.is_staff()) then raise exception 'Solo el personal autorizado puede actualizar pedidos' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido no encontrado'; end if;
  if v_order.status=p_new_status then return; end if;
  if p_new_status is null or not ((v_order.status='confirmed' and p_new_status in ('in_production','cancelled')) or (v_order.status='in_production' and p_new_status='quality_check') or (v_order.status='quality_check' and p_new_status in ('in_production','ready')) or (v_order.status='ready' and p_new_status='delivered')) then
    raise exception 'Transición no permitida: % -> %',v_order.status,p_new_status using errcode='22023'; end if;
  if char_length(coalesce(trim(p_note),''))>500 then raise exception 'La observación no puede superar 500 caracteres' using errcode='22023'; end if;
  if p_new_status='cancelled' and (not private.is_admin() or char_length(coalesce(trim(p_note),''))<5) then raise exception 'La cancelación requiere administrador y motivo de al menos 5 caracteres' using errcode='22023'; end if;
  if p_new_status='quality_check' and exists(select 1 from public.production_tasks where order_id=p_order_id and status<>'completed') then raise exception 'No se puede enviar a calidad mientras existan tareas de producción incompletas'; end if;
  if p_new_status='ready' then select result into v_latest_quality from public.quality_checks where order_id=p_order_id order by checked_at desc,id limit 1; if v_latest_quality is distinct from 'approved'::public.quality_result then raise exception 'Se necesita un control de calidad aprobado'; end if; end if;
  if p_new_status='cancelled' and v_order.status<>'confirmed' then raise exception 'Solo se puede cancelar un pedido antes de iniciar producción'; end if;
  perform set_config('app.order_transition_note',coalesce(trim(p_note),''),true);
  update public.orders set status=p_new_status,confirmed_at=case when p_new_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,started_at=case when p_new_status='in_production' then coalesce(started_at,now()) else started_at end,ready_at=case when p_new_status='ready' then now() else ready_at end,delivered_at=case when p_new_status='delivered' then now() else delivered_at end,cancelled_at=case when p_new_status='cancelled' then now() else cancelled_at end,updated_at=now() where id=p_order_id;
  perform set_config('app.order_transition_note','',true);
  if p_new_status='cancelled' and v_order.inventory_released_at is null then
    perform i.product_variant_id from public.inventory i join public.product_variants pv on pv.id=i.product_variant_id where pv.fulfillment_mode='stock' and i.product_variant_id in(select product_variant_id from public.order_items where order_id=p_order_id) order by i.product_variant_id for update;
    update public.inventory i set quantity_available=i.quantity_available+x.quantity,updated_at=now() from(select oi.product_variant_id,sum(oi.quantity)::integer quantity from public.order_items oi join public.product_variants pv on pv.id=oi.product_variant_id where oi.order_id=p_order_id and pv.fulfillment_mode='stock' group by oi.product_variant_id)x where i.product_variant_id=x.product_variant_id;
    insert into public.inventory_movements(product_variant_id,movement_type,quantity_delta,reason,order_id,created_by) select x.product_variant_id,'release',x.quantity,'Devolución de prendas terminadas por cancelación',p_order_id,(select auth.uid()) from(select oi.product_variant_id,sum(oi.quantity)::integer quantity from public.order_items oi join public.product_variants pv on pv.id=oi.product_variant_id where oi.order_id=p_order_id and pv.fulfillment_mode='stock' group by oi.product_variant_id)x;
    update public.orders set inventory_released_at=now() where id=p_order_id;
  end if;
end; $$;
revoke all on function public.transition_order_status(uuid,public.order_status,text) from public,anon;
grant execute on function public.transition_order_status(uuid,public.order_status,text) to authenticated;
notify pgrst,'reload schema';
