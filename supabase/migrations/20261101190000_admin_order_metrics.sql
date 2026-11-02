-- SCRUM-34: one consistent snapshot, business day in Bolivia, active admins only.
create or replace function public.admin_order_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz';
  v_end timestamptz := v_start + interval '1 day';
  v_result jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'Se requiere una cuenta administradora activa' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'orders_today', count(*) filter (where created_at >= v_start and created_at < v_end),
    'in_production', count(*) filter (where status = 'in_production'),
    'delivered_today', count(*) filter (where status = 'delivered' and delivered_at >= v_start and delivered_at < v_end),
    'delivered_amount_today', coalesce(sum(total) filter (where status = 'delivered' and delivered_at >= v_start and delivered_at < v_end), 0),
    'as_of', now(),
    'timezone', 'America/La_Paz'
  ) into v_result from public.orders;
  return v_result;
end;
$$;
revoke all on function public.admin_order_metrics() from public, anon;
grant execute on function public.admin_order_metrics() to authenticated;
comment on function public.admin_order_metrics() is 'Administrator-only order snapshot. Delivered amount is order value, not collected revenue.';
