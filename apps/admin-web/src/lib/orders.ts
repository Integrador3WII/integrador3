import { supabase } from './supabase';

export type OrderStatus = 'Pendiente' | 'En producción' | 'Listo' | 'Entregado';
export type AdminOrder = { id: string; customer: string; product: string; amount: string; status: OrderStatus };

function statusLabel(value: unknown): OrderStatus {
  const status = String(value ?? '').toUpperCase();
  if (status.includes('PRODUCTION')) return 'En producción';
  if (status.includes('READY') || status.includes('QUALITY')) return 'Listo';
  if (status.includes('DELIVER')) return 'Entregado';
  return 'Pendiente';
}

function amountLabel(row: Record<string, unknown>) {
  const amount = row.total_amount ?? row.total ?? row.grand_total ?? row.total_price ?? row.amount;
  return amount === null || amount === undefined ? '—' : `Bs. ${Number(amount).toLocaleString('es-BO')}`;
}

function mapOrder(row: Record<string, unknown>): AdminOrder {
  const rawId = String(row.id ?? row.order_number ?? '—');
  const shortId = rawId.length > 12 ? rawId.slice(0, 8) : rawId;
  const profile = typeof row.profiles === 'object' && row.profiles !== null ? row.profiles as Record<string, unknown> : null;
  return {
    id: shortId.startsWith('#') ? shortId : `#${shortId}`,
    customer: String(row.customer_name ?? row.customer ?? profile?.full_name ?? 'Cliente'),
    product: String(row.product_name ?? row.product ?? 'Pedido personalizado'),
    amount: amountLabel(row),
    status: statusLabel(row.status),
  };
}

export async function loadRecentOrders() {
  if (!supabase) return { orders: [] as AdminOrder[], error: null };
  const { data, error } = await supabase.from('orders').select('*').limit(6);
  return { orders: (data ?? []).map((row) => mapOrder(row as Record<string, unknown>)), error };
}
