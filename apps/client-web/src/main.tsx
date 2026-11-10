import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { orderLabels, PortalAuth, portalDb, portalRpc, usePortalSession } from '@textilflow/shared/portal';
import '@textilflow/shared/portal.css';

type Variant = {
  variant_id: string; product_name: string; description: string | null; category: string;
  color: string; size: string; base_price: number; min_quantity: number;
  max_quantity: number | null; allows_customization: boolean; image_path?: string | null;
};
type Line = { variant: Variant; quantity: number };
type Item = { name: string; color: string; size: string; quantity: number };
type Quote = {
  id: string; quote_number: string; status: string; total: number | null; valid_until: string | null;
  customer_notes: string | null; items: Item[] | null;
};
type Order = { id: string; order_number: string; status: string; total: number; items: Item[] | null };
type Activity = { quotes: Quote[]; orders: Order[] };

const amounts = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });
const quoteLabels: Record<string, string> = {
  submitted: 'Recibida', under_review: 'En revisión', sent: 'Oferta disponible', approved: 'Aprobada',
  rejected: 'Rechazada', expired: 'Vencida', cancelled: 'Cancelada',
};

function ItemList({ items }: { items: Item[] | null }) {
  return items?.length ? <ul>{items.map((item, index) =>
    <li key={index}>{item.quantity} × {item.name} · {item.color} · {item.size}</li>)}</ul> : null;
}

function CustomerActivity({ onSelectCatalog }: { onSelectCatalog: () => void }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    setBusy(true);
    portalRpc<Activity>('customer_activity')
      .then(data => { if (active) { setActivity(data); setError(''); } })
      .catch(problem => { if (active) setError(problem.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [refresh]);

  async function respond(id: string, approve: boolean) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await portalRpc('respond_to_quote', { p_quote_id: id, p_approve: approve });
      setMessage(approve ? 'Oferta aprobada. El taller puede convertirla en pedido.' : 'Oferta rechazada.');
      setRefresh(value => value + 1);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  }

  return <section className="portal-stack" aria-label="Mi actividad">
    <div className="portal-actions">
      <button type="button" className="portal-secondary" disabled={busy}
        onClick={() => setRefresh(value => value + 1)}>Actualizar actividad</button>
      <button type="button" onClick={onSelectCatalog}>Ver catálogo</button>
    </div>
    {busy && <p role="status">Consultando tu actividad…</p>}
    {error && <p role="alert" className="portal-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {activity && <>
      <h2>Mis cotizaciones</h2>
      {activity.quotes.length === 0 && <p className="portal-muted">Aún no tienes solicitudes.</p>}
      <div className="portal-grid">{activity.quotes.map(quote =>
        <article className="portal-card" key={quote.id}>
          <h3>{quote.quote_number}</h3>
          <span className="portal-badge">{quoteLabels[quote.status] ?? quote.status}</span>
          <ItemList items={quote.items} />
          {quote.customer_notes && <p>{quote.customer_notes}</p>}
          {quote.total !== null && <p><strong>{amounts.format(quote.total)}</strong></p>}
          {quote.total !== null && quote.valid_until && <p>Válida hasta {quote.valid_until}</p>}
          {quote.status === 'sent' && <div className="portal-actions">
            <button disabled={busy} onClick={() => respond(quote.id, true)}>Aprobar oferta</button>
            <button disabled={busy} className="portal-secondary" onClick={() => respond(quote.id, false)}>Rechazar oferta</button>
          </div>}
        </article>)}</div>
      <h2>Mis pedidos</h2>
      {activity.orders.length === 0 && <p className="portal-muted">Aún no tienes pedidos.</p>}
      <div className="portal-grid">{activity.orders.map(order =>
        <article className="portal-card" key={order.id}>
          <h3>{order.order_number}</h3>
          <span className="portal-badge">{orderLabels[order.status] ?? order.status}</span>
          <ItemList items={order.items} />
          <p><strong>{amounts.format(order.total)}</strong></p>
        </article>)}</div>
    </>}
  </section>;
}

function App() {
  const session = usePortalSession();
  const [section, setSection] = useState<'catalog' | 'activity'>('catalog');
  const [showLogin, setShowLogin] = useState(false);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef<{ body: string; id: string } | null>(null);

  useEffect(() => {
    if (!portalDb) return;
    let active = true;
    portalRpc<Variant[]>('customer_catalog')
      .then(data => { if (active) { setVariants(data); setCatalogError(''); } })
      .catch(problem => { if (active) setCatalogError(problem.message); });
    return () => { active = false; };
  }, [catalogRefresh]);

  function add(variant: Variant) {
    setLines(current => current.some(line => line.variant.variant_id === variant.variant_id)
      ? current : [...current, { variant, quantity: 1 }]);
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || lines.length === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    const items = lines.map(({ variant, quantity }) => ({ variant_id: variant.variant_id, quantity }));
    const body = JSON.stringify([items, notes.trim()]);
    try {
      if (operation.current?.body !== body) operation.current = { body, id: crypto.randomUUID() };
      await portalRpc('customer_request_quote', {
        p_request_id: operation.current.id, p_lines: items, p_notes: notes,
      });
      operation.current = null;
      setLines([]);
      setNotes('');
      setMessage('Solicitud enviada al taller.');
      setSection('activity');
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    const result = await portalDb?.auth.signOut({ scope: 'local' });
    if (result?.error) { setError('No se pudo cerrar la sesión.'); return; }
    operation.current = null;
    setLines([]);
    setNotes('');
    setMessage('');
    setError('');
    setShowLogin(false);
    setSection('catalog');
  }

  const filter = search.trim().toLocaleLowerCase('es-BO');
  const visible = variants?.filter(v => [v.product_name, v.color, v.size, v.category]
    .some(value => value.toLocaleLowerCase('es-BO').includes(filter)));

  return <main className="portal-shell">
    <header className="portal-header">
      <div><p className="portal-kicker">TextilFlow · Portal cliente</p><h1>Prendas a tu medida</h1></div>
      {session ? <button className="portal-secondary" disabled={submitting} onClick={signOut}>Cerrar sesión</button>
        : portalDb && session === null && <button className="portal-secondary"
          onClick={() => setShowLogin(value => !value)}>{showLogin ? 'Ocultar acceso' : 'Acceder'}</button>}
    </header>
    {!portalDb && <p role="alert" className="portal-error">Configura Supabase en el archivo de entorno para usar el portal.</p>}
    {showLogin && session === null && <PortalAuth allowSignUp />}
    {session && <nav aria-label="Navegación del portal" className="portal-actions">
      <button aria-pressed={section === 'catalog'} onClick={() => setSection('catalog')}>Catálogo</button>
      <button className="portal-secondary" aria-pressed={section === 'activity'}
        onClick={() => setSection('activity')}>Mis cotizaciones y pedidos</button>
    </nav>}
    {error && <p role="alert" className="portal-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {session && section === 'activity' ? <CustomerActivity key={session.user.id} onSelectCatalog={() => setSection('catalog')} />
      : portalDb && <>
        <section className="portal-stack" aria-labelledby="catalog-title">
          <h2 id="catalog-title">Catálogo</h2>
          <label>Buscar prendas<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
          {catalogError ? <div className="portal-actions">
            <p role="alert" className="portal-error">{catalogError}</p>
            <button onClick={() => setCatalogRefresh(value => value + 1)}>Reintentar catálogo</button>
          </div> : visible === undefined ? <p role="status">Cargando catálogo…</p> : visible.length === 0
            ? <p className="portal-muted">No encontramos variantes disponibles.</p> : <div className="portal-grid">
              {visible.map(variant => <article key={variant.variant_id} className="portal-card">
                {portalDb && variant.image_path && <img className="portal-product-photo"
                  src={portalDb.storage.from('product-images').getPublicUrl(variant.image_path).data.publicUrl}
                  alt={`${variant.product_name} · ${variant.color}`} width={640} height={640} loading="lazy" />}
                <span className="portal-badge">{variant.category}</span>
                <h3>{variant.product_name}</h3>
                <p>{variant.color} · {variant.size}</p>
                {variant.description && <p className="portal-muted">{variant.description}</p>}
                <p>{amounts.format(variant.base_price)} por unidad · precio de referencia</p>
                <p className="portal-muted">Mínimo por producto: {variant.min_quantity}
                  {variant.max_quantity !== null && ` · Máximo: ${variant.max_quantity}`}</p>
                {variant.allows_customization && <p>Admite personalización</p>}
                <button type="button" disabled={submitting || lines.length >= 30
                  || lines.some(line => line.variant.variant_id === variant.variant_id)}
                  onClick={() => add(variant)}>Agregar a cotización</button>
              </article>)}
            </div>}
        </section>
        {lines.length > 0 && <section className="portal-card" aria-labelledby="request-title">
          <h2 id="request-title">Solicitar cotización</h2>
          <form onSubmit={requestQuote}>
            {lines.map(({ variant, quantity }) => <div className="portal-actions" key={variant.variant_id}>
              <label>{variant.product_name} · {variant.color} · {variant.size}
                <input type="number" min={1} max={100000} step={1} required disabled={submitting}
                  value={Number.isNaN(quantity) ? '' : quantity}
                  onChange={e => {
                    const count = e.target.valueAsNumber;
                    setLines(current => current.map(line => line.variant.variant_id === variant.variant_id
                      ? { ...line, quantity: count } : line));
                  }} />
              </label>
              <button type="button" className="portal-secondary" disabled={submitting}
                onClick={() => setLines(current => current.filter(line => line.variant.variant_id !== variant.variant_id))}>
                Quitar
              </button>
            </div>)}
            <label>Notas de personalización o entrega
              <textarea maxLength={500} disabled={submitting} value={notes} onChange={e => setNotes(e.target.value)} />
            </label>
            {session ? <button disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button>
              : <button type="button" onClick={() => { setShowLogin(true); window.scrollTo(0, 0); }}>Acceder para enviar</button>}
          </form>
        </section>}
      </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
