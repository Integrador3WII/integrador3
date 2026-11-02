import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import UserManagement from './UserManagement';
import CatalogManagement from './CatalogManagement';
import InventoryManagement from './InventoryManagement';
import OrderManagement from './OrderManagement';
import QuoteManagement from './QuoteManagement';
import './catalog.css';
import { supabase } from '../lib/supabase';
import { getOrderMetrics, type OrderMetrics } from '../lib/adminMetrics';
import { displayAmount } from '../lib/adminOrders';

type Props = { session?: Session };
type View = 'dashboard' | 'users' | 'catalog' | 'inventory' | 'orders' | 'quotes';

const navigation: Array<{ label: string; icon: string; view: View }> = [
  { label: 'Resumen', icon: '▦', view: 'dashboard' },
  { label: 'Usuarios', icon: '♙', view: 'users' },
  { label: 'Catálogo', icon: '▧', view: 'catalog' },
  { label: 'Inventario', icon: '▤', view: 'inventory' },
  { label: 'Pedidos', icon: '▣', view: 'orders' },
  { label: 'Cotizaciones', icon: '▥', view: 'quotes' },
];

function AdminDashboard({ session }: Props) {
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState<View>('dashboard');

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

  return (
    <div className={`app-shell admin-shell ${darkMode ? 'dark-mode' : ''} ${view === 'dashboard' ? 'dashboard-only' : 'users-view'}`}>
      <aside className="sidebar" aria-label="Navegación administrativa">
        <button className="sidebar-brand" type="button" onClick={() => setView('dashboard')} aria-label="TextilFlow, inicio">
          <span className="brand-mark">TF</span><span className="brand-word"><strong>TEXTIL<br />FLOW</strong><small>ADMIN</small></span>
        </button>
        <nav className="sidebar-nav">
          {navigation.map((item) => <button aria-label={item.label} aria-current={view === item.view ? 'page' : undefined} className={`sidebar-link ${view === item.view ? 'active' : ''}`} type="button" onClick={() => setView(item.view)} key={item.label}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" type="button" aria-label={darkMode ? 'Modo claro' : 'Modo oscuro'} onClick={() => setDarkMode((value) => !value)} aria-pressed={darkMode}>
            <span aria-hidden="true">{darkMode ? '☀' : '◐'}</span><span className="theme-label">{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
          <div className="side-user"><span>TF</span><small>Administración</small></div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar admin-topbar">
          <div><p className="eyebrow">TextilFlow 2.0 · Centro de operaciones</p><span className="page-context">{{ dashboard: 'Resumen general', users: 'Administración de usuarios', catalog: 'Catálogo de prendas', inventory: 'Control de inventario', orders: 'Gestión de pedidos', quotes: 'Gestión de cotizaciones' }[view]}</span></div>
          <div className="topbar-actions"><span className="live-status"><i /> Operación activa</span><div className="user-profile"><div className="avatar">TF</div><div><strong>{session?.user.email ?? 'Admin TextilFlow'}</strong><span>Administrador</span></div>{session && <button className="logout-button" onClick={handleSignOut}>Salir</button>}</div></div>
        </header>

        {view === 'dashboard' && <DashboardOverview />}
        {view === 'users' && <UserManagement />}
        {view === 'catalog' && <CatalogManagement />}
        {view === 'inventory' && <InventoryManagement userId={session?.user.id} />}
        {view === 'orders' && <OrderManagement />}
        {view === 'quotes' && <QuoteManagement />}
      </main>
    </div>
  );
}

function DashboardOverview() {
  const [data, setData] = useState<OrderMetrics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setData(null);
    getOrderMetrics().then(result => { if (active) setData(result); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudieron consultar los indicadores.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [refresh]);
  const metrics = [
    { label: 'Pedidos hoy', value: data?.orders_today ?? '—', detail: 'Creados hoy', tone: 'sky', symbol: '↗' },
    { label: 'En producción', value: data?.in_production ?? '—', detail: 'Pedidos en este estado', tone: 'meadow', symbol: '◒' },
    { label: 'Entregados hoy', value: data?.delivered_today ?? '—', detail: 'Entregas registradas hoy', tone: 'mist', symbol: '✓' },
    { label: 'Importe entregado hoy', value: data ? displayAmount(data.delivered_amount_today) : '—', detail: 'Valor de pedidos, no cobros', tone: 'teal', symbol: '◌' },
  ];
  return <section className="dashboard-overview" aria-labelledby="dashboard-title">
    <div className="overview-grid">
      <article className="welcome-card"><div><p className="eyebrow">Resumen conectado · horario de Bolivia</p><h1 id="dashboard-title">Gestión textil<br /><em>con intención.</em></h1><p>Gestiona el taller desde Usuarios, Catálogo, Inventario y Pedidos.</p></div><span className="welcome-orb" aria-hidden="true" /></article>
      <article className="focus-card" aria-label="Estado de producción"><div className="focus-heading"><span>Producción activa</span><i>•</i></div><strong>{data?.in_production ?? '—'}</strong><p>órdenes en proceso</p><div className="focus-footer"><span>{busy ? 'Consultando indicadores…' : data ? `Actualizado ${new Date(data.as_of).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz' })}` : 'Indicadores no disponibles'}</span><button className="catalog-button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Actualizar resumen</button></div></article>
    </div>
    <section className="metrics-section" aria-label="Métricas principales"><div className="section-heading"><div><p className="eyebrow">Pulso operativo</p><h2>Tu operación, <em>en una mirada.</em></h2></div><span>{busy ? 'Consultando…' : data ? 'Datos reales · Supabase' : 'Sin datos disponibles'}</span></div>{error && <p role="alert" className="users-message error">{error}</p>}<div className="metrics-grid">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><span className="metric-symbol">{metric.symbol}</span><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div></section>
  </section>;
}

export default AdminDashboard;
