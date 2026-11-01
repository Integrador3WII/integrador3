import { useEffect, useState, type FormEvent } from 'react';
import { CatalogGate, Modal, Pagination } from './CatalogShared';
import { displayAmount, displayStatus, getAdminOrder, listAdminOrders, listOrderHistory, orderStates, allowedOrderTransitions, transitionOrder, type OrderRow, type OrderFilters } from '../lib/adminOrders';

const message = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la consulta.';
function date(value: unknown) {
  const parsed = typeof value === 'string' ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : 'No disponible';
}
export default function OrderManagement() {
  return <CatalogGate><Orders /></CatalogGate>;
}
function Orders() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [filters, setFilters] = useState<OrderFilters>({});
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    listAdminOrders(page, filter, filters).then(result => { if (active) { setRows(result.rows); setCount(result.count); } })
      .catch(e => { if (active) setError(message(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, filter, filters, refresh]);
  function searchOrders(e: FormEvent) { e.preventDefault(); setPage(0); setFilter(search); setRefresh(v => v + 1); }
  return <section className="catalog-workspace" aria-labelledby="orders-title">
    <div className="users-header"><div><p className="eyebrow">ADMIN WEB · PEDIDOS</p><h1 id="orders-title">Pedidos del taller</h1><p>Consulta las prendas y los importes registrados de cada pedido.</p></div><button className="catalog-button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Actualizar</button></div>
    <form className="catalog-toolbar" onSubmit={searchOrders}><label>Identificador completo<input value={search} onChange={e => setSearch(e.target.value)} placeholder="UUID del pedido" /></label><button className="catalog-button" type="submit" disabled={busy}>Buscar</button><button className="catalog-button" type="button" onClick={() => { setSearch(''); setFilter(''); setPage(0); }}>Limpiar</button></form>
    <div className="catalog-toolbar"><label>Estado<select value={filters.status ?? ''} onChange={e => { setPage(0); setFilters(f => ({ ...f, status: e.target.value })); }}><option value="">Todos</option>{Object.entries(orderStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Desde (Bolivia)<input type="date" value={filters.from ?? ''} onChange={e => { setPage(0); setFilters(f => ({ ...f, from: e.target.value })); }} /></label><label>Hasta (Bolivia)<input type="date" value={filters.until ?? ''} onChange={e => { setPage(0); setFilters(f => ({ ...f, until: e.target.value })); }} /></label><button className="catalog-button" onClick={() => { setFilters({}); setPage(0); }}>Quitar filtros</button></div>
    <div className="catalog-toolbar"><label>Cliente<input value={filters.customer ?? ''} placeholder="Buscar por nombre" onChange={e => { setPage(0); setFilters(f => ({ ...f, customer: e.target.value })); }} /></label></div>
    {error && <p className="users-message error" role="alert">{error} <button className="catalog-button" onClick={() => setRefresh(v => v + 1)}>Reintentar</button></p>}
    <div className="catalog-card"><div className="catalog-table-scroll"><table><caption className="sr-only">Listado de pedidos</caption><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Detalle</th></tr></thead><tbody>
      {!busy && !error && rows.map(row => <tr key={row.id}><td data-label="Pedido"><strong>{String(row.order_number ?? row.id)}</strong><small>{row.id}</small></td><td data-label="Fecha">{date(row.created_at)}</td><td data-label="Estado">{displayStatus(row.status)}</td><td data-label="Total">{displayAmount(row.total)}</td><td data-label="Detalle"><button className="catalog-button" onClick={() => setSelected(row.id)}>Ver pedido</button></td></tr>)}
    </tbody></table>{busy ? <p className="catalog-empty" role="status">Consultando pedidos…</p> : !error && rows.length === 0 && <p className="catalog-empty">No hay pedidos para esta consulta.</p>}</div><Pagination page={page} count={count} onPage={setPage} busy={busy || Boolean(error)} /></div>
    {selected && <OrderDetail id={selected} onChanged={() => setRefresh(v => v + 1)} onClose={() => setSelected(null)} />}
  </section>;
}
function OrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAdminOrder>> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  async function changeStatus(e: FormEvent) {
    e.preventDefault(); if (saving || !status) return;
    setSaving(true); setActionError(''); setSuccess('');
    try { await transitionOrder(id, status, note); setStatus(''); setNote(''); setSuccess('Estado actualizado.'); setRetry(v => v + 1); onChanged(); }
    catch (e) { setActionError(message(e)); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    let active = true; setError(''); setDetail(null);
    getAdminOrder(id).then(value => { if (active) setDetail(value); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [id, retry]);
  return <Modal title="Detalle del pedido" onClose={onClose} busy={saving}>
    <p className="catalog-help" style={{ overflowWrap: 'anywhere' }}>{id}</p>
    {error ? <p role="alert" className="users-message error">{error} <button className="catalog-button" onClick={() => setRetry(v => v + 1)}>Reintentar detalle</button></p> : !detail ? <p role="status">Cargando detalle…</p> : <>
      <p>Estado: {displayStatus(detail.order.status)} · Total: {displayAmount(detail.order.total)}</p>
      <p>Cliente: {String((detail.order.customer as { full_name?: string } | null)?.full_name ?? detail.order.customer_id ?? 'No disponible')}</p>
      <p>Entrega: {detail.order.delivery_method === 'delivery' ? String(detail.order.shipping_address ?? 'Dirección no disponible') : 'Recojo en taller'}</p>
      <p className="catalog-help">Precios registrados en el pedido.</p>
      {detail.items.length === 0 ? <p>El pedido no tiene prendas registradas.</p> : <ol className="movement-history">{detail.items.map(item => <li key={item.id}><strong>{String(item.product_name_snapshot ?? 'Prenda')}</strong><p>{String(item.sku_snapshot ?? 'Sin SKU')} · {String(item.color_snapshot ?? '')} · {String(item.size_snapshot ?? '')}</p><small>Cantidad: {String(item.quantity ?? '—')} · Precio unitario: {displayAmount(item.unit_price)}</small></li>)}</ol>}
      {success && <p role="status">{success}</p>}
      {(allowedOrderTransitions[String(detail.order.status)] ?? []).length > 0 && <form className="catalog-form" onSubmit={changeStatus}>
        <h3>Cambiar estado</h3><label>Nuevo estado<select required disabled={saving} value={status} onChange={e => setStatus(e.target.value)}><option value="">Seleccionar…</option>{(allowedOrderTransitions[String(detail.order.status)] ?? []).map(value => <option key={value} value={value}>{displayStatus(value)}</option>)}</select></label>
        <label>Observación{status === 'cancelled' ? ' (obligatoria)' : ''}<textarea disabled={saving} required={status === 'cancelled'} minLength={status === 'cancelled' ? 5 : undefined} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        {status === 'cancelled' && <p>Al confirmar se cancelará el pedido y se devolverá su stock.</p>}
        {actionError && <p role="alert">{actionError}</p>}<button className="catalog-button" disabled={saving || !status}>{saving ? 'Guardando…' : 'Confirmar cambio'}</button>
      </form>}
      <History key={retry} id={id} />
    </>}
  </Modal>;
}

function History({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ rows: OrderRow[]; count: number } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setResult(null); setError('');
    listOrderHistory(id, page).then(data => { if (active) setResult(data); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [id, page, retry]);
  return <section aria-label="Historial de estados"><h3>Historial de estados</h3>{error ? <p role="alert">{error} <button className="catalog-button" onClick={() => setRetry(v => v + 1)}>Reintentar historial</button></p> : !result ? <p role="status">Cargando historial…</p> : <>{!result.rows.length && <p>Sin cambios registrados.</p>}<ol className="movement-history">{result.rows.map(row => <li key={row.id}><strong>{displayStatus(row.from_status)} → {displayStatus(row.to_status)}</strong><p>{String(row.note ?? 'Sin observación')}</p><small>{date(row.created_at)} · {String(row.changed_by ?? 'Sistema')}</small></li>)}</ol><Pagination page={page} count={result.count} onPage={setPage} /></>}</section>;
}
