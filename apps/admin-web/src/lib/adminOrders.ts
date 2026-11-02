import { supabase } from './supabase';
import { PAGE_SIZE } from './catalog';

export type OrderRow = Record<string, unknown> & { id: string };
export const orderStates: Record<string, string> = {
  confirmed: 'Confirmado', in_production: 'En producción', quality_check: 'Control de calidad',
  ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado',
};
export function displayStatus(value: unknown) {
  const key = String(value ?? '');
  return orderStates[key] ?? (key || 'Sin estado');
}
export function displayAmount(value: unknown) {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return 'No disponible';
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(Number(value));
}
export type OrderFilters = { status?: string; from?: string; until?: string; customer?: string };
export const allowedOrderTransitions: Record<string, string[]> = {
  confirmed: ['in_production', 'cancelled'], in_production: ['quality_check'],
  quality_check: ['in_production', 'ready'], ready: ['delivered'], delivered: [], cancelled: [],
};
export async function transitionOrder(id: string, status: string, note: string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  if (note.trim().length > 500 || (status === 'cancelled' && note.trim().length < 5)) throw new Error('La cancelación requiere un motivo de 5 a 500 caracteres.');
  const { error } = await supabase.rpc('transition_order_status', { p_order_id: id, p_new_status: status, p_note: note.trim() || null });
  if (error) throw new Error(error.code === 'P0001' || error.code === '22023' ? error.message : 'No se pudo cambiar el estado. Actualiza el detalle y vuelve a intentarlo.');
}
export function orderDateBounds(filters: OrderFilters) {
  if (filters.from && filters.until && filters.from > filters.until) throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  const lower = filters.from ? new Date(`${filters.from}T00:00:00-04:00`).toISOString() : undefined;
  const upper = filters.until ? new Date(new Date(`${filters.until}T00:00:00-04:00`).getTime() + 86400000).toISOString() : undefined;
  return { lower, upper };
}
export async function listAdminOrders(page: number, id: string, filters: OrderFilters = {}) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const search = id.trim();
  if (search && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search))
    throw new Error('Introduce el identificador completo del pedido (UUID).');
  let query = supabase.from('orders').select('*,customer:profiles!orders_customer_id_fkey!inner(full_name)', { count: 'exact' });
  if (search) query = query.eq('id', search);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.customer?.trim()) query = query.ilike('customer.full_name', `%${filters.customer.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const { lower, upper } = orderDateBounds(filters);
  if (lower) query = query.gte('created_at', lower);
  if (upper) query = query.lt('created_at', upper);
  const { data, count, error } = await query.order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw new Error('No se pudieron consultar los pedidos. Revisa la conexión y los permisos e inténtalo nuevamente.');
  return { rows: (data ?? []) as OrderRow[], count: count ?? 0 };
}

export async function listOrderHistory(id: string, page: number) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const { data, count, error } = await supabase.from('order_status_history')
    .select('id,from_status,to_status,changed_by,note,created_at', { count: 'exact' })
    .eq('order_id', id).order('created_at', { ascending: false }).order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw new Error('No se pudo consultar el historial del pedido.');
  return { rows: (data ?? []) as OrderRow[], count: count ?? 0 };
}
export async function getAdminOrder(id: string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const [order, items] = await Promise.all([
    supabase.from('orders').select('*,customer:profiles!orders_customer_id_fkey(full_name,phone)').eq('id', id).single(),
    supabase.from('order_items').select('*').eq('order_id', id).order('id'),
  ]);
  if (order.error || items.error) throw new Error('No se pudo cargar el detalle completo del pedido.');
  return { order: order.data as OrderRow, items: (items.data ?? []) as OrderRow[] };
}
