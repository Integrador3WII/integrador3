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
  { label: 'Pedidos hoy', value: '24', trend: '+12%', tone: 'blue' },
  { label: 'En producción', value: '11', trend: '+4%', tone: 'violet' },
  { label: 'Completados', value: '8', trend: '+18%', tone: 'green' },
  { label: 'Ingresos del día', value: 'Bs. 3.450', trend: '+9%', tone: 'amber' },
];

function AdminDashboard({ session }: Props) {
  const [orders, setOrders] = useState<AdminOrder[]>(demoOrders);
  const [usingDemoData, setUsingDemoData] = useState(!session);

  useEffect(() => {
    if (!session || !supabase) return;
    let mounted = true;
    loadRecentOrders().then(({ orders: loadedOrders }) => {
      if (!mounted) return;
      if (loadedOrders.length > 0) {
        setOrders(loadedOrders);
        setUsingDemoData(false);
      }
    });
    return () => { mounted = false; };
  }, [session]);

  async function handleSignOut() { await supabase?.auth.signOut(); }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand"><div className="brand-mark">TF</div><div><strong>TextilFlow</strong><span>Administración</span></div></div>
        <nav>
          <a className="nav-item active" href="#dashboard">⌂ <span>Dashboard</span></a>
          <a className="nav-item" href="#orders">▣ <span>Pedidos</span><small>24</small></a>
          <a className="nav-item" href="#products">▤ <span>Productos</span></a>
          <a className="nav-item" href="#inventory">◈ <span>Inventario</span></a>
          <a className="nav-item" href="#quotes">▱ <span>Cotizaciones</span></a>
          <a className="nav-item" href="#users">♙ <span>Usuarios</span></a>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Sistema operativo</div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div><p className="eyebrow">Panel de control</p><h1>Buenos días, administrador</h1></div>
          <div className="topbar-actions"><button className="icon-button" aria-label="Notificaciones">♧<span className="notification-dot" /></button><div className="user-profile"><div className="avatar">AR</div><div><strong>{session?.user.email ?? 'Admin TextilFlow'}</strong><span>Administrador</span></div>{session && <button className="logout-button" onClick={handleSignOut}>Salir</button>}</div></div>
        </header>

        {usingDemoData && <div className="demo-notice" role="status">Vista de demostración: inicia sesión y configura las políticas RLS para consultar pedidos reales.</div>}
        <section className="metrics-grid" aria-label="Métricas principales">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-icon">◌</div><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.trend} vs. ayer</small></div></article>)}</section>

        <section className="content-grid">
          <article className="panel orders-panel" id="orders"><div className="panel-heading"><div><p className="eyebrow">Actividad reciente</p><h2>Pedidos recientes</h2></div><a href="#orders">Ver todos →</a></div><div className="table-wrapper"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{order.product}</td><td><strong>{order.amount}</strong></td><td><span className={`badge ${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></td></tr>)}</tbody></table></div></article>
          <article className="panel progress-panel"><div className="panel-heading"><div><p className="eyebrow">Producción</p><h2>Resumen semanal</h2></div><button className="more-button" aria-label="Más opciones">•••</button></div><div className="chart" aria-label="Gráfico de pedidos de la semana">{[38, 58, 48, 78, 62, 88, 70].map((height, index) => <div className="bar-column" key={index}><div className="bar" style={{ height: `${height}%` }} /><span>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][index]}</span></div>)}</div><div className="chart-summary"><strong>156 pedidos</strong><span>Procesados esta semana</span></div></article>
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
