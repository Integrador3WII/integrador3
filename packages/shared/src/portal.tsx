import { createClient, type Session } from '@supabase/supabase-js';
import React, { useEffect, useState, type FormEvent } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const portalId = import.meta.env.VITE_PORTAL_ID;
export const portalDb = url && key
  ? createClient(url, key, portalId ? { auth: { storageKey: `textilflow-${portalId}` } } : undefined)
  : null;

export async function portalRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!portalDb) throw new Error('Falta configurar la conexión con Supabase.');
  const { data, error } = await portalDb.rpc(name, args);
  if (!error) return data as T;
  if (error.code === 'PGRST202') throw new Error('Este módulo todavía no está habilitado en Supabase.');
  if (error.code === '42501') throw new Error('Tu cuenta no tiene permiso para esta operación.');
  if (error.code === '22023' || error.code === 'P0001') throw new Error(error.message);
  throw new Error('No se pudo completar la operación. Verifica la conexión e inténtalo de nuevo.');
}

export function usePortalSession() {
  const [session, setSession] = useState<Session | null | undefined>(portalDb ? undefined : null);
  useEffect(() => {
    if (!portalDb) return;
    const { data } = portalDb.auth.onAuthStateChange((_, current) => setSession(current));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function PortalAuth({ allowSignUp = false }: { allowSignUp?: boolean }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portalDb) return;
    const fields = new FormData(event.currentTarget);
    const credentials = {
      email: String(fields.get('email')).trim(),
      password: String(fields.get('password')),
    };
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (register) {
        const fullName = String(fields.get('full_name')).trim();
        if (fullName.length < 2) throw new Error('Escribe tu nombre.');
        const { data, error: authError } = await portalDb.auth.signUp({
          ...credentials,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        });
        if (authError) throw new Error('No se pudo crear la cuenta. Revisa el correo y la contraseña.');
        if (!data.session) setMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
      } else {
        const { error: authError } = await portalDb.auth.signInWithPassword(credentials);
        if (authError) throw new Error('No se pudo iniciar sesión. Revisa tus credenciales.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se pudo conectar con Supabase.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="portal-card portal-auth">
    <h2>{register ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
    {error && <p role="alert" className="portal-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <form onSubmit={submit}>
      {register && <label>Nombre completo<input name="full_name" autoComplete="name" required maxLength={120} /></label>}
      <label>Correo electrónico<input type="email" name="email" autoComplete="email" required /></label>
      <label>Contraseña<input type="password" name="password"
        autoComplete={register ? 'new-password' : 'current-password'}
        minLength={register ? 8 : undefined} required /></label>
      <button disabled={busy}>{busy ? 'Conectando…' : register ? 'Registrarme' : 'Entrar'}</button>
    </form>
    {allowSignUp && <button type="button" className="portal-secondary" disabled={busy}
      onClick={() => { setRegister(!register); setError(''); setMessage(''); }}>
      {register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}
    </button>}
  </section>;
}

export const orderLabels: Record<string, string> = {
  confirmed: 'Confirmado', in_production: 'En producción', quality_check: 'Control de calidad',
  ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado',
};
