import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { orderLabels, PortalAuth, portalDb, portalRpc, usePortalSession } from '@textilflow/shared/portal';
import '@textilflow/shared/portal.css';

type Task = {
  id: string; status: string; priority: number; name: string; size: string; color: string;
  quantity: number; notes: string | null; can_update: boolean;
};
type Order = {
  id: string; order_number: string; status: string; tasks: Task[];
  latest_quality: { result: string; notes: string | null; checked_at: string } | null;
};
type Mutation = (name: string, args: Record<string, unknown>, message: string) => Promise<void>;

const taskLabels: Record<string, string> = {
  pending: 'Pendiente', assigned: 'Asignada', in_progress: 'En curso', blocked: 'Bloqueada', completed: 'Completada',
};
const qualityLabels: Record<string, string> = {
  pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', rework: 'Requiere corrección',
};
const controls = [
  ['medidas', 'Medidas verificadas'],
  ['acabados', 'Costuras y acabados verificados'],
  ['personalizacion', 'Personalización conforme al pedido'],
] as const;
const pageSize = 20;

function QualityForm({ orderId, busy, mutate }: { orderId: string; busy: boolean; mutate: Mutation }) {
  const [result, setResult] = useState('approved');
  const operation = useRef<{ body: string; id: string } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checklist = Object.fromEntries(controls.map(([key]) => [key, form.has(key)]));
    const notes = String(form.get('notes') ?? '').trim();
    const body = JSON.stringify([result, checklist, notes]);
    if (operation.current?.body !== body) operation.current = { body, id: crypto.randomUUID() };
    void mutate('staff_record_quality', {
      p_order_id: orderId, p_operation_id: operation.current.id, p_result: result,
      p_checklist: checklist, p_notes: notes,
    }, result === 'approved' ? 'Control aprobado. Pedido listo.' : 'Pedido devuelto a producción.');
  }

  return <form onSubmit={submit}>
    <fieldset disabled={busy}>
      <legend>Control de calidad</legend>
      {controls.map(([key, label]) => <label key={key} className="portal-actions">
        <input type="checkbox" name={key} required={result === 'approved'} /> {label}
      </label>)}
    </fieldset>
    <label>Resultado
      <select disabled={busy} value={result} onChange={event => setResult(event.target.value)}>
        <option value="approved">Aprobar</option>
        <option value="rework">Devolver a producción</option>
      </select>
    </label>
    <label>Observaciones<textarea name="notes" maxLength={500} minLength={result === 'rework' ? 5 : undefined}
      required={result === 'rework'} disabled={busy} /></label>
    <button disabled={busy}>Registrar control</button>
  </form>;
}

function WorkOrder({ order, busy, mutate }: { order: Order; busy: boolean; mutate: Mutation }) {
  const inProduction = order.status === 'in_production';
  const next = order.status === 'confirmed' ? 'in_production'
    : inProduction ? 'quality_check' : order.status === 'ready' ? 'delivered' : null;
  const incomplete = order.tasks.some(task => task.status !== 'completed');
  const nextLabel = { in_production: 'Iniciar producción', quality_check: 'Enviar a calidad', delivered: 'Marcar como entregado' };

  return <article className="portal-card">
    <h2>{order.order_number}</h2>
    <span className="portal-badge">{orderLabels[order.status] ?? order.status}</span>
    {order.latest_quality && <p className="portal-muted">
      Último control · {qualityLabels[order.latest_quality.result] ?? order.latest_quality.result}
      {order.latest_quality.notes && ` · ${order.latest_quality.notes}`}
    </p>}
    {order.tasks.length > 0 && <details open={inProduction || undefined}>
      <summary>Tareas ({order.tasks.filter(task => task.status === 'completed').length}/{order.tasks.length})</summary>
      <div className="portal-stack">
        {order.tasks.map(task => <section className="portal-card" key={task.id}>
          <h3>{task.quantity} × {task.name}</h3>
          <p>{task.color} · {task.size} · Prioridad {task.priority}</p>
          <p className="portal-muted">{taskLabels[task.status] ?? task.status}{!task.can_update && ' · Asignada a otra persona'}</p>
          {task.notes && <p>{task.notes}</p>}
          {inProduction && task.can_update && task.status !== 'completed' && <button disabled={busy}
            onClick={() => mutate('staff_update_production_task', {
              p_task_id: task.id, p_status: task.status === 'in_progress' ? 'completed' : 'in_progress',
            }, 'Tarea actualizada.')}>
            {task.status === 'in_progress' ? 'Completar tarea' : 'Iniciar tarea'}
          </button>}
        </section>)}
      </div>
    </details>}
    {next && <button disabled={busy || (inProduction && incomplete)}
      onClick={() => mutate('transition_order_status', { p_order_id: order.id, p_new_status: next }, 'Estado del pedido actualizado.')}>
      {nextLabel[next]}
    </button>}
    {order.status === 'quality_check' && <QualityForm orderId={order.id} busy={busy} mutate={mutate} />}
  </article>;
}

function WorkQueue() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setBusy(true);
    portalRpc<Order[]>('staff_work_orders', { p_offset: offset })
      .then(rows => { if (active) { setOrders(rows); setError(''); } })
      .catch(problem => { if (active) setError(problem.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [offset, refresh]);

  const mutate: Mutation = async (name, args, success) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await portalRpc(name, args);
      setMessage(success);
      setRefresh(value => value + 1);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  };

  return <section className="portal-stack" aria-label="Cola de trabajo">
    <div className="portal-actions">
      <button className="portal-secondary" disabled={busy}
        onClick={() => setRefresh(value => value + 1)}>Actualizar pedidos</button>
      <button className="portal-secondary" disabled={busy || offset === 0}
        onClick={() => setOffset(value => value - pageSize)}>Anterior</button>
      <button className="portal-secondary" disabled={busy || orders?.length !== pageSize}
        onClick={() => setOffset(value => value + pageSize)}>Siguiente</button>
    </div>
    {busy && <p role="status">Consultando pedidos…</p>}
    {error && <p className="portal-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {orders?.length === 0 && <p className="portal-muted">No hay pedidos en esta página.</p>}
    <div className="portal-grid">{orders?.map(order => <WorkOrder key={order.id} order={order} busy={busy} mutate={mutate} />)}</div>
  </section>;
}

function App() {
  const session = usePortalSession();
  const [error, setError] = useState('');
  async function signOut() {
    const result = await portalDb?.auth.signOut({ scope: 'local' });
    setError(result?.error ? 'No se pudo cerrar la sesión.' : '');
  }
  return <main className="portal-shell">
    <header className="portal-header">
      <div><p className="portal-kicker">TextilFlow · Operaciones</p><h1>Taller y control de calidad</h1></div>
      {session && <button className="portal-secondary" onClick={signOut}>Cerrar sesión</button>}
    </header>
    {error && <p role="alert" className="portal-error">{error}</p>}
    {!portalDb ? <p role="alert" className="portal-error">Configura Supabase en el archivo de entorno para usar Taller.</p>
      : session === undefined ? <p role="status">Cargando sesión…</p>
      : session ? <WorkQueue key={session.user.id} /> : <PortalAuth />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Servicio de instalación no disponible', error));
}
