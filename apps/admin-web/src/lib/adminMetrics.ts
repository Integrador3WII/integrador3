import { supabase } from './supabase';

export type OrderMetrics = {
  orders_today: number;
  in_production: number;
  delivered_today: number;
  delivered_amount_today: number;
  as_of: string;
  timezone: string;
};
export async function getOrderMetrics(): Promise<OrderMetrics> {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const { data, error } = await supabase.rpc('admin_order_metrics');
  if (error) throw new Error('No se pudieron consultar los indicadores. Revisa tu conexión y el acceso administrativo.');
  const keys = ['orders_today', 'in_production', 'delivered_today', 'delivered_amount_today'] as const;
  if (!data || keys.some(key => typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < 0)
    || typeof data.as_of !== 'string' || !Number.isFinite(Date.parse(data.as_of)) || data.timezone !== 'America/La_Paz') {
    throw new Error('Los indicadores recibidos están incompletos. Vuelve a intentarlo.');
  }
  return data as OrderMetrics;
}
