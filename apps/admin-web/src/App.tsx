import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AdminDashboard from './components/AdminDashboard';
import LoginPage from './components/LoginPage';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) return <AdminDashboard />;
  if (loading) return <div className="screen-state">Verificando sesión…</div>;
  if (!session) return <LoginPage />;
  return <AdminDashboard session={session} />;
}

export default App;
