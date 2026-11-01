import { useEffect,useState,type FormEvent } from 'react';
import { CatalogGate,Modal,Pagination } from './CatalogShared';
import { displayAmount,type OrderRow } from '../lib/adminOrders';
import { convertAdminQuote,getAdminQuote,listAdminQuotes,moneyInput,quoteStates,sendAdminQuote } from '../lib/adminQuotes';
const message=(e:unknown)=>e instanceof Error?e.message:'No se pudo completar la operación.';
const customer=(row:OrderRow)=>String((row.customer as {full_name?:string}|null)?.full_name??row.customer_id??'Sin nombre');
function ServiceBreakdown({services}:{services:unknown}) {
  if(!Array.isArray(services)||!services.length)return null;
  const modes:Record<string,string>={flat:'importe fijo',per_item:'por prenda',per_unit:'por unidad de servicio'};
  return <ul>{services.map(service=><li key={service.id}>{service.service?.name??'Servicio'}: {displayAmount(service.unit_price_override??service.unit_price_snapshot??service.service?.unit_price)} ({modes[String(service.pricing_mode_snapshot??service.service?.pricing_mode)]??'Modalidad no disponible'}), unidades: {String(service.units)}</li>)}</ul>;
}
export default function QuoteManagement(){return <CatalogGate><Quotes /></CatalogGate>;}
function Quotes(){
  const [rows,setRows]=useState<OrderRow[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(0);
  const [status,setStatus]=useState(''),[selected,setSelected]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let active=true;setBusy(true);setError('');listAdminQuotes(page,status).then(r=>{if(active){setRows(r.rows);setCount(r.count);}}).catch(e=>{if(active)setError(message(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[page,status,refresh]);
  return <section className="catalog-workspace" aria-labelledby="quotes-title">
    <div className="users-header"><div><p className="eyebrow">ADMIN WEB · COTIZACIONES</p><h1 id="quotes-title">Cotizaciones del taller</h1><p>Valora las solicitudes recibidas y convierte las ofertas aprobadas en pedidos.</p></div><button className="catalog-button" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Actualizar</button></div>
    <div className="catalog-toolbar"><label>Estado de cotización<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Todos</option>{Object.entries(quoteStates).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    {error&&<p role="alert">{error} <button className="catalog-button" onClick={()=>setRefresh(v=>v+1)}>Reintentar</button></p>}
    <div className="catalog-card"><div className="catalog-table-scroll"><table><caption className="sr-only">Solicitudes de cotización</caption><thead><tr><th>Cotización</th><th>Cliente</th><th>Estado</th><th>Vigencia</th><th>Acciones</th></tr></thead><tbody>{!busy&&!error&&rows.map(row=><tr key={row.id}><td data-label="Cotización">{String(row.quote_number??row.id)}</td><td data-label="Cliente">{customer(row)}</td><td data-label="Estado">{quoteStates[String(row.status)]??String(row.status)}</td><td data-label="Vigencia">{String(row.valid_until??'Por definir')}</td><td data-label="Acciones"><button className="catalog-button" onClick={()=>setSelected(row.id)}>Ver cotización</button></td></tr>)}</tbody></table>{busy?<p role="status" className="catalog-empty">Consultando cotizaciones…</p>:!error&&!rows.length&&<p className="catalog-empty">No hay cotizaciones para esta consulta.</p>}</div><Pagination page={page} count={count} onPage={setPage} busy={busy||!!error}/></div>
    {selected&&<QuoteDetail id={selected} onClose={()=>setSelected(null)} onChanged={()=>setRefresh(v=>v+1)}/>}
  </section>;
}
function QuoteDetail({id,onClose,onChanged}:{id:string;onClose:()=>void;onChanged:()=>void}){
  const [detail,setDetail]=useState<Awaited<ReturnType<typeof getAdminQuote>>|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [prices,setPrices]=useState<Record<string,string>>({}),[discount,setDiscount]=useState('0'),[shipping,setShipping]=useState('0'),[until,setUntil]=useState('');
  const [saving,setSaving]=useState(false),[actionError,setActionError]=useState(''),[order,setOrder]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;setDetail(null);setError('');getAdminQuote(id).then(r=>{if(active){setDetail(r);setPrices(Object.fromEntries(r.items.map(item=>[item.id,String(item.unit_price??'')])));setDiscount(String(r.quote.discount_amount??0));setShipping(String(r.quote.shipping_amount??0));setUntil(String(r.quote.valid_until??''));}}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[id,retry]);
  async function send(e:FormEvent){e.preventDefault();if(saving)return;setSaving(true);setActionError('');try{await sendAdminQuote(id,prices,discount,shipping,until);setNotice('Oferta enviada. Sus precios quedan congelados.');setRetry(v=>v+1);onChanged();}catch(e){setActionError(message(e));}finally{setSaving(false);}}
  async function convert(){if(saving)return;setSaving(true);setActionError('');try{setOrder(await convertAdminQuote(id));onChanged();}catch(e){setActionError(message(e));}finally{setSaving(false);}}
  const editable=detail&&['submitted','under_review'].includes(String(detail.quote.status));
  let preview:number|null=null;
  if(detail&&editable){try{const cents=detail.items.reduce((sum,item)=>sum+Math.round(moneyInput(prices[item.id]??'')*100)*Number(item.quantity)+Math.round(Number(item.customization_total)*100),0);preview=(cents-Math.round(moneyInput(discount)*100)+Math.round(moneyInput(shipping)*100))/100;}catch{preview=null;}}
  return <Modal title="Detalle de cotización" onClose={onClose} busy={saving}>
    {error?<p role="alert">{error} <button className="catalog-button" onClick={()=>setRetry(v=>v+1)}>Reintentar detalle</button></p>:!detail?<p role="status">Cargando cotización…</p>:<>
      <p><strong>{String(detail.quote.quote_number)}</strong> · {quoteStates[String(detail.quote.status)]}</p><p>Cliente: {customer(detail.quote)}</p><p>{String(detail.quote.customer_notes??'Sin observaciones del cliente')}</p>
      <form className="catalog-form" onSubmit={send}><ol className="movement-history">{detail.items.map(item=>{const v=item.variant as {sku?:string;product?:{name?:string}}|null;return <li key={item.id}><strong>{v?.product?.name??v?.sku??'Prenda'}</strong><p>{v?.sku} · Cantidad: {String(item.quantity)} · Servicios: {displayAmount(item.customization_total)}</p><ServiceBreakdown services={item.services}/>{editable?<label>Precio unitario {v?.sku??item.id}<input inputMode="decimal" required disabled={saving} value={prices[item.id]??''} onChange={e=>setPrices(p=>({...p,[item.id]:e.target.value}))}/></label>:<p>Precio histórico: {displayAmount(item.unit_price)} · Total: {displayAmount(item.line_total)}</p>}</li>;})}</ol>
      {editable?<><label>Descuento (Bs)<input required inputMode="decimal" disabled={saving} value={discount} onChange={e=>setDiscount(e.target.value)}/></label><label>Envío (Bs)<input required inputMode="decimal" disabled={saving} value={shipping} onChange={e=>setShipping(e.target.value)}/></label><label>Válida hasta<input type="date" required disabled={saving} value={until} onChange={e=>setUntil(e.target.value)}/></label><p>Total propuesto: {displayAmount(preview)}</p><p className="catalog-help">Al enviar se congelan los importes. El cliente podrá consultar y aprobar la oferta desde su cuenta.</p><button className="catalog-button" disabled={saving||!detail.items.length}>{saving?'Enviando…':'Enviar oferta al cliente'}</button></>:<p>Subtotal: {displayAmount(detail.totals.subtotal)} · Descuento: {displayAmount(detail.totals.discount_amount)} · Envío: {displayAmount(detail.totals.shipping_amount)} · Total: {displayAmount(detail.totals.total)}</p>}</form>
      {detail.quote.status==='approved'&&<button className="catalog-button" disabled={saving||!!order} onClick={convert}>{saving?'Generando pedido…':'Convertir a pedido'}</button>}
      {actionError&&<p role="alert">{actionError}</p>}{notice&&<p role="status">{notice}</p>}{order&&<p role="status" style={{overflowWrap:'anywhere'}}>Pedido disponible: {order}. Consúltalo en Pedidos con este identificador.</p>}
      <h3>Últimos 20 cambios</h3><ol className="movement-history">{detail.history.map(row=><li key={row.id}>{quoteStates[String(row.from_status)]??'Creación'} → {quoteStates[String(row.to_status)]??String(row.to_status)}<small>{new Date(String(row.created_at)).toLocaleString('es-BO',{timeZone:'America/La_Paz'})} · {String(row.changed_by??'Sistema')}</small></li>)}</ol>
    </>}
  </Modal>;
}
