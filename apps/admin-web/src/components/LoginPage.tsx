import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase no está configurado.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) setError('No se pudo iniciar sesión. Verifica tu correo y contraseña.');
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand auth-brand"><div className="brand-mark">TF</div><div><strong>TextilFlow</strong><span>Administración</span></div></div>
        <p className="eyebrow">Acceso seguro</p>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="auth-description">Ingresa con una cuenta autorizada para administrar pedidos y producción.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar al panel'}</button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
