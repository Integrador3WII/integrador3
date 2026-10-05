import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import UserManagement from './UserManagement';
import { supabase } from '../lib/supabase';

type Props = { session?: Session };
type View = 'dashboard' | 'users';

const metrics = [
  { label: 'Pedidos hoy', value: '24', trend: '+12%', tone: 'sky', symbol: '↗' },
  { label: 'En producción', value: '11', trend: '+4%', tone: 'meadow', symbol: '◒' },
  { label: 'Completados', value: '8', trend: '+18%', tone: 'mist', symbol: '✓' },
  { label: 'Ingresos del día', value: 'Bs. 3.450', trend: '+9%', tone: 'teal', symbol: '◌' },
];

const navigation: Array<{ label: string; icon: string; view: View }> = [
  { label: 'Resumen', icon: '▦', view: 'dashboard' },
  { label: 'Usuarios', icon: '♙', view: 'users' },
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
          {navigation.map((item) => <button className={`sidebar-link ${view === item.view ? 'active' : ''}`} type="button" onClick={() => setView(item.view)} key={item.label}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}
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
          <div><p className="eyebrow">TextilFlow 2.0 · Centro de operaciones</p><span className="page-context">{view === 'dashboard' ? 'Resumen general' : 'Administración de usuarios'}</span></div>
          <div className="topbar-actions"><span className="live-status"><i /> Operación activa</span><div className="user-profile"><div className="avatar">TF</div><div><strong>{session?.user.email ?? 'Admin TextilFlow'}</strong><span>Administrador</span></div>{session && <button className="logout-button" onClick={handleSignOut}>Salir</button>}</div></div>
        </header>

        {view === 'dashboard' ? <DashboardOverview /> : <UserManagement />}
      </main>
    </div>
  );
}

function DashboardOverview() {
  return <section className="dashboard-overview" aria-labelledby="dashboard-title">
    <div className="overview-grid">
      <article className="welcome-card"><div><p className="eyebrow">Vista de hoy</p><h1 id="dashboard-title">Gestión textil<br /><em>con intención.</em></h1><p>Producción, pedidos e ingresos reunidos en una sola vista operativa.</p></div><span className="welcome-orb" aria-hidden="true" /></article>
      <article className="focus-card" aria-label="Estado de producción"><div className="focus-heading"><span>Producción activa</span><i>•</i></div><strong>11</strong><p>órdenes en proceso</p><div className="progress-line"><span /></div><div className="focus-footer"><span>Capacidad semanal</span><b>72%</b></div></article>
    </div>
    <section className="metrics-section" aria-label="Métricas principales"><div className="section-heading"><div><p className="eyebrow">Pulso operativo</p><h2>Tu operación, <em>en una mirada.</em></h2></div><span>Actualizado ahora</span></div><div className="metrics-grid">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><span className="metric-symbol">{metric.symbol}</span><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.trend} <span>vs. ayer</span></small></article>)}</div></section>
  </section>;
}

export default AdminDashboard;
