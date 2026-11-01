import { supabase } from './supabase';
import { PAGE_SIZE } from './catalog';
import type { OrderRow } from './adminOrders';
export const quoteStates: Record<string,string> = { draft:'Borrador', submitted:'Solicitud recibida', under_review:'En revisión', sent:'Enviada al cliente', approved:'Aprobada', rejected:'Rechazada', expired:'Vencida', cancelled:'Cancelada' };
const fail = (error: {code?:string;message?:string} | null) => {
  if (error) throw new Error(['22023','P0001'].includes(error.code ?? '') ? error.message : 'No se pudo completar la operación. Revisa tu acceso y vuelve a intentarlo.');
};
export function moneyInput(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value)>99999999.99) throw new Error('Introduce importes no negativos con un máximo de dos decimales.');
  return Number(value);
}
export async function listAdminQuotes(page:number,status:string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  let query=supabase.from('quotes').select('*,customer:profiles!quotes_customer_id_fkey(full_name)',{count:'exact'});
  if(status) query=query.eq('status',status);
  const {data,count,error}=await query.order('created_at',{ascending:false}).order('id').range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
  fail(error); return {rows:(data??[]) as OrderRow[],count:count??0};
}
export async function getAdminQuote(id:string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const [quote,items,pricing,totals,history]=await Promise.all([
    supabase.from('quotes').select('*,customer:profiles!quotes_customer_id_fkey(full_name,phone)').eq('id',id).single(),
    supabase.from('quote_items').select('*,variant:product_variants(sku,color_name,size_code,product:products(name)),services:quote_item_services(*,service:customization_services(name,unit_price,pricing_mode))').eq('quote_id',id).order('id'),
    supabase.from('v_quote_item_pricing').select('*').eq('quote_id',id).order('id'),
    supabase.from('v_quote_totals').select('*').eq('id',id).single(),
    supabase.from('quote_status_history').select('*').eq('quote_id',id).order('created_at',{ascending:false}).order('id').limit(20),
  ]);
  [quote,items,pricing,totals,history].forEach(r=>fail(r.error));
  return {quote:quote.data as OrderRow,items:(items.data??[]).map(item=>({...item,...pricing.data?.find(p=>p.id===item.id)})) as OrderRow[],totals:totals.data as OrderRow,history:(history.data??[]) as OrderRow[]};
}
export async function sendAdminQuote(id:string,prices:Record<string,string>,discount:string,shipping:string,validUntil:string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  if (!validUntil) throw new Error('Indica la fecha de vigencia.');
  const {error}=await supabase.rpc('admin_send_quote',{p_quote_id:id,p_items:Object.entries(prices).map(([id,price])=>({id,unit_price:moneyInput(price)})),p_discount:moneyInput(discount),p_shipping:moneyInput(shipping),p_valid_until:validUntil});
  fail(error);
}
export async function convertAdminQuote(id:string) {
  if (!supabase) throw new Error('La conexión de datos no está configurada.');
  const {data,error}=await supabase.rpc('convert_quote_to_order',{p_quote_id:id}); fail(error);
  if(typeof data!=='string') throw new Error('No se recibió el identificador del pedido. Actualiza la consulta antes de reintentar.');
  return data;
}
