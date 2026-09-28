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

const navigation = ['Resumen', 'Pedidos', 'Productos', 'Inventario', 'Cotizaciones'];

function AdminDashboard({ session }: Props) {
  const [orders, setOrders] = useState<AdminOrder[]>(demoOrders);
  const [usingDemoData, setUsingDemoData] = useState(!session);

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
    <div className="app-shell">
      <span className="shape shape-sun" aria-hidden="true">✳</span>
      <span className="shape shape-orbit" aria-hidden="true" />

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <a className="brand" href="#dashboard" aria-label="TextilFlow, inicio">
            <span className="brand-mark">TF</span>
            <span><strong>TEXTIL<br />FLOW</strong><small>ADMIN STUDIO</small></span>
          </a>

          <nav className="top-nav" aria-label="Navegación principal">
            {navigation.map((item, index) => <a className={index === 0 ? 'active' : ''} href={index === 1 ? '#orders' : '#dashboard'} key={item}>{item}</a>)}
          </nav>

          <div className="topbar-actions">
            <span className="live-status"><i /> Operación activa</span>
            <div className="user-profile">
              <div className="avatar">TF</div>
              <div><strong>{session?.user.email ?? 'Admin TextilFlow'}</strong><span>Administrador</span></div>
              {session && <button className="logout-button" onClick={handleSignOut}>Salir</button>}
            </div>
          </div>
        </header>

        <section className="hero-panel" aria-labelledby="dashboard-title">
          <div className="hero-copy">
            <p className="eyebrow">Panel de control · TextilFlow 2.0</p>
            <h1 id="dashboard-title">Gestión textil<br /><em>con intención.</em></h1>
            <p className="hero-description">Una vista clara de pedidos, producción e ingresos para tomar decisiones sin perder el hilo.</p>
            <a className="hero-action" href="#orders">Revisar pedidos <span>→</span></a>
          </div>
          <div className="hero-spotlight" aria-label="Estado de producción">
            <span className="spotlight-label">FOCO DEL DÍA</span>
            <strong>11</strong>
            <span>pedidos en<br />producción</span>
            <div className="spotlight-ring" />
          </div>
          <span className="hero-flower" aria-hidden="true">✳</span>
        </section>

        {usingDemoData && <div className="demo-notice" role="status"><span>i</span> Vista de demostración: inicia sesión con una cuenta administradora para consultar los pedidos visibles según RLS.</div>}

        <section className="metrics-section" aria-label="Métricas principales">
          <div className="section-heading"><p className="eyebrow">Pulso operativo</p><h2>Todo lo importante, <em>en una mirada.</em></h2></div>
          <div className="metrics-grid">
            {metrics.map((metric) => (
              <article className={`metric-card ${metric.tone}`} key={metric.label}>
                <span className="metric-symbol">{metric.symbol}</span>
                <span className="metric-label">{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.trend} <span>vs. ayer</span></small>
              </article>
            ))}
          </div>
        </section>

        <section className="content-grid">
          <article className="panel orders-panel" id="orders">
            <div className="panel-heading">
              <div><p className="eyebrow">Actividad reciente</p><h2>Pedidos <em>recientes.</em></h2></div>
              <a className="quiet-link" href="#orders">Ver todos <span>→</span></a>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Estado</th></tr></thead>
                <tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{order.product}</td><td><strong>{order.amount}</strong></td><td><span className={`badge ${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></td></tr>)}</tbody>
              </table>
            </div>
          </article>

          <article className="panel production-panel">
            <div className="panel-heading"><div><p className="eyebrow">Producción</p><h2>Ritmo <em>semanal.</em></h2></div><span className="chart-badge">156 pedidos</span></div>
            <div className="chart" aria-label="Gráfico de pedidos de la semana">
              {[38, 58, 48, 78, 62, 88, 70].map((height, index) => <div className="bar-column" key={index}><div className="bar" style={{ height: `${height}%` }} /><span>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][index]}</span></div>)}
            </div>
            <p className="chart-summary"><strong>+18%</strong> frente a la semana anterior</p>
          </article>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
