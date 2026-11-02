-- quantity_after consistently reports unreserved material available for new work.
alter table public.material_movements drop constraint if exists material_movements_quantity_delta_check;
alter table public.material_movements add constraint material_movements_quantity_delta_check
  check (quantity_delta <> 0 or movement_type = 'consume');
create or replace function public.admin_receive_material(p_material_id uuid,p_operation_id uuid,p_quantity numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_material public.materials%rowtype; v_movement public.material_movements%rowtype;
begin
  if not (select private.is_admin()) then raise exception 'Solo administradores pueden registrar recepciones' using errcode='42501'; end if;
  if p_operation_id is null or p_quantity<=0 or p_quantity>1000000 or char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'Revisa cantidad, motivo e identificador de operación' using errcode='22023'; end if;
  select * into v_material from public.materials where id=p_material_id for update;
  if v_material.id is null or not v_material.is_active then raise exception 'Material no disponible' using errcode='22023'; end if;
  select * into v_movement from public.material_movements where operation_id=p_operation_id;
  if v_movement.id is not null then
    if v_movement.material_id<>p_material_id or v_movement.quantity_delta<>p_quantity or v_movement.reason<>trim(p_reason) then raise exception 'El identificador ya fue usado para otra recepción' using errcode='22023'; end if;
    return to_jsonb(v_movement);
  end if;
  update public.materials set quantity_on_hand=quantity_on_hand+p_quantity,updated_at=now() where id=p_material_id returning * into v_material;
  insert into public.material_movements(material_id,movement_type,quantity_delta,quantity_after,reason,operation_id,created_by)
  values(p_material_id,'receipt',p_quantity,v_material.quantity_on_hand-v_material.quantity_reserved,trim(p_reason),p_operation_id,(select auth.uid())) returning * into v_movement;
  return to_jsonb(v_movement);
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
