import { useEffect, useState, type FormEvent } from 'react';
import { catalogError, listMovements, listVariants, recordMovement, validateMovement, statusLabels, type Movement, type MovementInput, type Variant } from '../lib/catalog';
import { CatalogGate, Modal, Pagination } from './CatalogShared';

type Target = { id: string; sku: string; stock: number | null };
type Pending = { input: MovementInput; sku: string };
const dateFormat = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' });

export default function InventoryManagement({ userId = 'preview' }: { userId?: string }) {
  return <CatalogGate><InventoryWorkspace storageKey={`textilflow.inventory.pending:${userId}`} /></CatalogGate>;
}

export function readPending(key: string): Pending | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Pending | null;
    if (!item || typeof item.sku !== 'string') return null;
    validateMovement(item.input);
    return item;
  } catch { return null; }
}

function InventoryWorkspace({ storageKey }: { storageKey: string }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<Pending | null>(() => readPending(storageKey));
  const [target, setTarget] = useState<Target | null>(null);
  const [history, setHistory] = useState<Target | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      listVariants(page, search).then(result => { if (active) { setRows(result.rows); setCount(result.count); } })
        .catch(e => { if (active) setError(catalogError(e)); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, refresh]);

  function persistPending(value: Pending | null) {
    // Fail before sending if the browser cannot preserve an uncertain operation.
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
    setPending(value);
  }
  return <section className="catalog-workspace" aria-labelledby="inventory-title">
    <div className="users-header"><div><p className="eyebrow">ADMIN WEB · INVENTARIO</p><h1 id="inventory-title">Cada unidad cuenta.</h1><p>Existencias por variante e historial de entradas y salidas.</p></div><button className="catalog-button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Actualizar</button></div>
    {notice && <p className="users-message success" role="status">{notice}</p>}
    {pending && <div className="catalog-pending" role="status"><p>Hay una operación sin confirmar para <strong>{pending.sku}</strong>. Reinténtala con el mismo identificador antes de registrar otra.</p><button className="catalog-button" onClick={() => setTarget({ id: pending.input.variantId, sku: pending.sku, stock: null })}>Revisar operación pendiente</button></div>}
    {error && <p role="alert" className="users-message error">{error} <button className="catalog-button" onClick={() => setRefresh(n => n + 1)}>Reintentar</button></p>}
    <div className="catalog-toolbar"><label>Buscar por SKU<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Ej. POL-AZ-M" /></label><p className="catalog-help">Solo variantes, productos y categorías activos admiten movimientos.</p></div>
    <div className="catalog-card"><div className="catalog-table-scroll"><table><caption className="sr-only">Existencias por variante</caption><thead><tr><th>Prenda / SKU</th><th>Variante</th><th>Disponible</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {!loading && !error && rows.map(row => {
        const enabled = row.status === 'active' && row.products?.status === 'active' && row.products?.categories?.is_active;
        const stock = row.inventory?.quantity_available ?? null;
        const item = { id: row.id, sku: row.sku, stock };
        return <tr key={row.id}><td data-label="Prenda / SKU"><strong>{row.products?.name ?? 'Producto'}</strong><small>{row.sku}</small></td><td data-label="Variante">{row.color_name} · {row.size_code}</td><td data-label="Disponible"><strong className={stock === 0 ? 'stock-empty' : 'stock-amount'}>{stock ?? '—'}</strong><small>unidades</small></td><td data-label="Estado"><span className={`catalog-status ${enabled ? 'active' : 'inactive'}`}>{enabled ? 'Disponible' : statusLabels[row.status] === 'Activo' ? 'No publicado' : statusLabels[row.status]}</span></td><td data-label="Acciones"><div className="catalog-row-actions"><button disabled={!enabled || stock === null || Boolean(pending)} aria-label={`Registrar movimiento de ${row.sku}`} onClick={() => setTarget(item)}>Movimiento</button><button aria-label={`Historial de ${row.sku}`} onClick={() => setHistory(item)}>Historial</button></div></td></tr>;
      })}
    </tbody></table>{loading ? <p className="catalog-empty" role="status">Cargando inventario…</p> : !error && !rows.length && <p className="catalog-empty">No hay variantes para mostrar. Crea una prenda y sus variantes en Catálogo.</p>}</div><Pagination page={page} count={count} onPage={setPage} busy={loading} /></div>
    <p className="catalog-help">El saldo solo cambia al registrar una operación. El historial se conserva y no se puede editar desde este panel.</p>
    {target && <MovementEditor target={target} pending={pending} persist={persistPending} onClose={() => setTarget(null)} onSaved={movement => {
      setTarget(null); setNotice(`Movimiento confirmado: ${movement.quantity_delta > 0 ? '+' : ''}${movement.quantity_delta} unidades. Saldo al registrar: ${movement.quantity_after}.`); setRefresh(n => n + 1);
    }} />}
    {history && <History target={history} onClose={() => setHistory(null)} />}
  </section>;
}

function MovementEditor({ target, pending, persist, onClose, onSaved }: { target: Target; pending: Pending | null; persist: (value: Pending | null) => void; onClose: () => void; onSaved: (movement: Movement) => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>(pending?.input.direction ?? 'in');
  const [quantity, setQuantity] = useState(String(pending?.input.quantity ?? ''));
  const [reason, setReason] = useState(pending?.input.reason ?? '');
  const [operationId] = useState(() => pending?.input.operationId ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const input = pending?.input ?? { variantId: target.id, operationId, direction, quantity: Number(quantity), reason: reason.trim() };
    setBusy(true); setError('');
    try {
      validateMovement(input);
      persist({ input, sku: target.sku });
      const movement = await recordMovement(input);
      persist(null);
      onSaved(movement);
    } catch (e) {
      // Only a definitive server rejection permits editing the request. A lost
      // response may have committed: retain its UUID and exact payload on reload.
      const code = (e as { code?: string }).code;
      if (code && ['22023', '42501', '22P02', '23514', 'PGRST202'].includes(code)) persist(null);
      setError(catalogError(e));
    } finally { setBusy(false); }
  }
  return <Modal title={`Movimiento · ${target.sku}`} busy={busy} onClose={onClose}><form className="catalog-form" onSubmit={submit}>
    <p className="catalog-help">{target.stock === null ? 'Reconfirmación de una operación pendiente.' : `Saldo consultado: ${target.stock} unidades. El servidor comprobará el saldo actual.`}</p>
    {error && <p className="users-message error" role="alert">{error}</p>}
    {pending && <p className="catalog-help">Los datos permanecen bloqueados para reintentar sin duplicar el movimiento. Si cierras, la operación pendiente se conserva en esta pestaña.</p>}
    <fieldset disabled={busy || Boolean(pending)}><label>Tipo de movimiento<select value={direction} onChange={e => setDirection(e.target.value as 'in' | 'out')}><option value="in">Entrada de stock</option><option value="out">Salida de stock</option></select></label>
      <label>Cantidad<input type="number" min="1" max="1000000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      <label>Motivo<textarea minLength={5} maxLength={250} required rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. Recepción de compra al proveedor" /></label></fieldset>
    <div className="catalog-actions"><button type="button" className="catalog-button" disabled={busy} onClick={onClose}>Cerrar</button><button type="submit" className="add-user-button" disabled={busy}>{busy ? 'Confirmando…' : pending ? 'Reintentar la misma operación' : 'Confirmar movimiento'}</button></div>
  </form></Modal>;
}

function History({ target, onClose }: { target: Target; onClose: () => void }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    listMovements(target.id, page).then(result => { if (active) { setRows(result.rows); setCount(result.count); } })
      .catch(e => { if (active) setError(catalogError(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [target.id, page, retry]);
  return <Modal title={`Historial · ${target.sku}`} onClose={onClose}>
    {error && <p role="alert" className="users-message error">{error} <button className="catalog-button" onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>}
    {busy ? <p role="status" className="catalog-empty">Cargando historial…</p> : !error && !rows.length ? <p className="catalog-empty">Aún no hay movimientos registrados.</p> : !error && <ol className="movement-history">{rows.map(row => <li key={row.id}><div><strong className={row.quantity_delta > 0 ? 'stock-amount' : 'stock-empty'}>{row.quantity_delta > 0 ? '+' : ''}{row.quantity_delta} unidades</strong><time dateTime={row.created_at}>{dateFormat.format(new Date(row.created_at))}</time></div><p>{row.reason || 'Sin motivo registrado'}</p><small>{row.profiles?.full_name || row.created_by || 'Sistema'} · Saldo al registrar: {row.quantity_after ?? 'No registrado (histórico)'}</small></li>)}</ol>}
    <Pagination page={page} count={count} onPage={setPage} busy={busy} />
  </Modal>;
}
