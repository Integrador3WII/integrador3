begin;

create or replace function public.staff_work_orders(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_orders jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'Se requiere una cuenta de personal activa' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Página inválida' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb)
  into v_orders
  from (
    select o.id, o.order_number, o.status, o.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'status', t.status, 'priority', t.priority, 'notes', t.notes,
          'can_update', t.assigned_to is null or t.assigned_to = (select auth.uid()) or (select private.is_admin()),
          'name', i.product_name_snapshot, 'size', i.size_snapshot,
          'color', i.color_snapshot, 'quantity', i.quantity
        ) order by t.priority, t.created_at, t.id)
        from public.production_tasks t join public.order_items i on i.id = t.order_item_id
        where t.order_id = o.id
      ), '[]'::jsonb) as tasks,
      (
        select jsonb_build_object('result', q.result, 'notes', q.notes, 'checked_at', q.checked_at)
        from public.quality_checks q where q.order_id = o.id order by q.checked_at desc, q.id limit 1
      ) as latest_quality
    from public.orders o
    where o.status in ('confirmed', 'in_production', 'quality_check', 'ready')
    order by o.created_at, o.id limit 20 offset p_offset
  ) r;
  return v_orders;
end;
$$;

create or replace function public.staff_update_production_task(
  p_task_id uuid, p_status public.production_task_status
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_task public.production_tasks%rowtype;
  v_order_status public.order_status;
begin
  if not (select private.is_staff()) then
    raise exception 'Se requiere una cuenta de personal activa' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('in_progress', 'completed') then
    raise exception 'Estado de tarea inválido' using errcode = '22023';
  end if;

  select o.status into v_order_status from public.orders o
  join public.production_tasks t on t.order_id = o.id
  where t.id = p_task_id for update of o;
  if not found then raise exception 'Tarea no encontrada' using errcode = '22023'; end if;

  select * into v_task from public.production_tasks where id = p_task_id for update;
  if not found then raise exception 'Tarea no encontrada' using errcode = '22023'; end if;
  if v_task.assigned_to is not null and v_task.assigned_to <> auth.uid() and not private.is_admin() then
    raise exception 'La tarea está asignada a otra persona' using errcode = '42501';
  end if;
  if v_task.status = p_status then return; end if;

  if v_order_status <> 'in_production' or not (
    (p_status = 'in_progress' and v_task.status in ('pending', 'assigned', 'blocked'))
    or (p_status = 'completed' and v_task.status = 'in_progress')
  ) then
    raise exception 'El pedido o la tarea no permiten este cambio' using errcode = '22023';
  end if;

  update public.production_tasks set
    assigned_to = coalesce(assigned_to, auth.uid()), status = p_status,
    started_at = coalesce(started_at, now()),
    completed_at = case when p_status = 'completed' then now() end
  where id = p_task_id;
end;
$$;

create or replace function public.staff_record_quality(
  p_order_id uuid, p_operation_id uuid, p_result public.quality_result,
  p_checklist jsonb, p_notes text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order_status public.order_status;
  v_previous public.quality_checks%rowtype;
  v_notes text := nullif(trim(p_notes), '');
begin
  if not (select private.is_staff()) then
    raise exception 'Se requiere una cuenta de personal activa' using errcode = '42501';
  end if;
  if p_operation_id is null or p_result is null or p_result not in ('approved', 'rework')
    or jsonb_typeof(p_checklist) is distinct from 'object'
    or jsonb_typeof(p_checklist->'medidas') is distinct from 'boolean'
    or jsonb_typeof(p_checklist->'acabados') is distinct from 'boolean'
    or jsonb_typeof(p_checklist->'personalizacion') is distinct from 'boolean'
    or coalesce(char_length(v_notes), 0) > 500 then
    raise exception 'Revisa el resultado, la lista de control y las observaciones' using errcode = '22023';
  end if;
  if p_result = 'approved' and not p_checklist @>
    '{"medidas":true,"acabados":true,"personalizacion":true}'::jsonb then
    raise exception 'Confirma los tres controles para aprobar' using errcode = '22023';
  end if;
  if p_result = 'rework' and coalesce(char_length(v_notes), 0) < 5 then
    raise exception 'Describe qué necesita corrección' using errcode = '22023';
  end if;

  select status into v_order_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado' using errcode = '22023'; end if;

  select * into v_previous from public.quality_checks where id = p_operation_id;
  if found then
    if v_previous.order_id = p_order_id and v_previous.performed_by = auth.uid()
      and v_previous.result = p_result and v_previous.checklist = p_checklist
      and v_previous.notes is not distinct from v_notes then return; end if;
    raise exception 'Identificador de control ya utilizado' using errcode = '22023';
  end if;
  if v_order_status <> 'quality_check' then
    raise exception 'El pedido debe estar en control de calidad' using errcode = '22023';
  end if;

  insert into public.quality_checks (id, order_id, performed_by, result, checklist, notes, checked_at)
  values (p_operation_id, p_order_id, auth.uid(), p_result, p_checklist, v_notes, clock_timestamp());
  if p_result = 'approved' then
    perform public.transition_order_status(p_order_id, 'ready', v_notes);
  else
    update public.production_tasks
    set status = 'pending', started_at = null, completed_at = null
    where order_id = p_order_id and status = 'completed';
    perform public.transition_order_status(p_order_id, 'in_production', v_notes);
  end if;
end;
$$;

revoke all on function public.staff_work_orders(integer),
  public.staff_update_production_task(uuid, public.production_task_status),
  public.staff_record_quality(uuid, uuid, public.quality_result, jsonb, text)
from public, anon, authenticated;
grant execute on function public.staff_work_orders(integer),
  public.staff_update_production_task(uuid, public.production_task_status),
  public.staff_record_quality(uuid, uuid, public.quality_result, jsonb, text)
to authenticated;
notify pgrst, 'reload schema';

commit;
