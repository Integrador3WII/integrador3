import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { loadRecentOrders, type AdminOrder } from '../lib/orders';
import { supabase } from '../lib/supabase';

type Props = { session?: Session };

const demoOrders: AdminOrder[] = [
  { id: '#1042', customer: 'Ana Vargas', product: 'Polera personalizada', amount: 'Bs. 450', status: 'En producción' },
  { id: '#1041', customer: 'Luis Rojas', product: 'Hoodie bordado', amount: 'Bs. 720', status: 'Listo' },
  { id: '#1040', customer: 'Carla Flores', product: 'Uniformes corporativos', amount: 'Bs. 1.850', status: 'Pendiente' },
  { id: '#1039', customer: 'Mario Pérez', product: 'Poleras promocionales', amount: 'Bs. 980', status: 'Entregado' },
];

const metrics = [
  { label: 'Pedidos hoy', value: '24', trend: '+12%', tone: 'sky', symbol: '↗' },
  { label: 'En producción', value: '11', trend: '+4%', tone: 'meadow', symbol: '◒' },
  { label: 'Completados', value: '8', trend: '+18%', tone: 'mist', symbol: '✓' },
  { label: 'Ingresos del día', value: 'Bs. 3.450', trend: '+9%', tone: 'teal', symbol: '◌' },
];

const navigation = [
  { label: 'Resumen', icon: '▦', href: '#dashboard' },
  { label: 'Pedidos', icon: '□', href: '#orders' },
  { label: 'Productos', icon: '◇', href: '#dashboard' },
  { label: 'Inventario', icon: '▤', href: '#dashboard' },
  { label: 'Reportes', icon: '◫', href: '#dashboard' },
];

function AdminDashboard({ session }: Props) {
  const [orders, setOrders] = useState<AdminOrder[]>(demoOrders);
  const [usingDemoData, setUsingDemoData] = useState(!session);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!session || !supabase) return;
    let mounted = true;

    loadRecentOrders().then(({ orders: loadedOrders }) => {
      if (mounted && loadedOrders.length > 0) {
        setOrders(loadedOrders);
        setUsingDemoData(false);
      }
    });

    return () => { mounted = false; };
  }, [session]);

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

  return (
    <div className={`app-shell admin-shell ${darkMode ? 'dark-mode' : ''}`}>
      <aside className="sidebar" aria-label="Navegación administrativa">
        <a className="sidebar-brand" href="#dashboard" aria-label="TextilFlow, inicio">
          <span className="brand-mark">TF</span>
          <span className="brand-word"><strong>TEXTIL<br />FLOW</strong><small>ADMIN</small></span>
        </a>
        <nav className="sidebar-nav">
          {navigation.map((item, index) => (
            <a className={`sidebar-link ${index === 0 ? 'active' : ''}`} href={item.href} key={item.label}>
              <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" type="button" onClick={() => setDarkMode((value) => !value)} aria-pressed={darkMode}>
            <span aria-hidden="true">{darkMode ? '☀' : '◐'}</span><span className="theme-label">{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
          <div className="side-user"><span>TF</span><small>Administración</small></div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar admin-topbar">
          <div><p className="eyebrow">TextilFlow 2.0 · Centro de operaciones</p><span className="page-context">Resumen general</span></div>
          <div className="topbar-actions">
            <span className="live-status"><i /> Operación activa</span>
            <div className="user-profile">
              <div className="avatar">TF</div>
              <div><strong>{session?.user.email ?? 'Admin TextilFlow'}</strong><span>Administrador</span></div>
              {session && <button className="logout-button" onClick={handleSignOut}>Salir</button>}
            </div>
          </div>
        </header>

        <section className="overview-grid" aria-labelledby="dashboard-title">
          <article className="welcome-card">
            <div><p className="eyebrow">Vista de hoy</p><h1 id="dashboard-title">Gestión textil<br /><em>con intención.</em></h1><p>Controla la producción, los pedidos y las entregas sin perder el hilo de la operación.</p></div>
            <a className="hero-action" href="#orders">Ver pedidos <span>→</span></a><span className="welcome-orb" aria-hidden="true" />
          </article>
          <article className="focus-card" aria-label="Estado de producción">
            <div className="focus-heading"><span>Producción activa</span><i>•</i></div><strong>11</strong><p>órdenes en proceso</p><div className="progress-line"><span /></div><div className="focus-footer"><span>Capacidad semanal</span><b>72%</b></div>
          </article>
        </section>

        {usingDemoData && <div className="demo-notice" role="status"><span>i</span> Vista de demostración: inicia sesión con una cuenta administradora para consultar los pedidos visibles según RLS.</div>}

        <section className="metrics-section" aria-label="Métricas principales">
          <div className="section-heading"><div><p className="eyebrow">Pulso operativo</p><h2>Tu operación, <em>en una mirada.</em></h2></div><a href="#orders">Actualizar datos ↗</a></div>
          <div className="metrics-grid">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><span className="metric-symbol">{metric.symbol}</span><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.trend} <span>vs. ayer</span></small></article>)}</div>
        </section>

        <section className="content-grid">
          <article className="panel orders-panel" id="orders">
            <div className="panel-heading"><div><p className="eyebrow">Actividad reciente</p><h2>Pedidos <em>recientes.</em></h2></div><a className="quiet-link" href="#orders">Ver todos <span>→</span></a></div>
            <div className="table-wrapper"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{order.product}</td><td><strong>{order.amount}</strong></td><td><span className={`badge ${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></td></tr>)}</tbody></table></div>
          </article>
          <article className="panel production-panel">
            <div className="panel-heading"><div><p className="eyebrow">Producción</p><h2>Ritmo <em>semanal.</em></h2></div><span className="chart-badge">156 pedidos</span></div>
            <div className="chart" aria-label="Gráfico de pedidos de la semana">{[38, 58, 48, 78, 62, 88, 70].map((height, index) => <div className="bar-column" key={index}><div className="bar" style={{ height: `${height}%` }} /><span>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][index]}</span></div>)}</div><p className="chart-summary"><strong>+18%</strong> frente a la semana anterior</p>
          </article>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
