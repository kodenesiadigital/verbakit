import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth.tsx';
import { adminUrl } from '../site.ts';

export function LoginPage() {
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(loginValue, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>Verbakit</h1>
        <p className="sub">Masuk ke dasbor admin</p>
        {error && <div className="wp-notice error">{error}</div>}
        <div>
          <label htmlFor="login">Username atau Email</label>
          <input
            id="login"
            type="text"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="wp-btn primary" type="submit" disabled={busy}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <a href={adminUrl('/lupa-password')} style={{ fontSize: 13 }}>
            Lupa password?
          </a>
        </div>
      </form>
    </div>
  );
}