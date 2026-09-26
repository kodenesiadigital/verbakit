import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';

/** Halaman "/admin/lupa-password" - minta tautan reset. */
export function ForgotPasswordPage() {
  const [login, setLogin] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/forgot-password', { login });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>Lupa Password</h1>
        <p className="sub">Masukkan username atau email Anda</p>
        {error && <div className="wp-notice error">{error}</div>}
        {sent ? (
          <>
            <div className="wp-notice success">
              Jika akun tersebut terdaftar, tautan reset sudah dikirim ke email Anda. Tautan berlaku 30 menit.
            </div>
            <Link className="wp-btn primary" to="/admin">
              Kembali ke halaman masuk
            </Link>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="login">Username atau Email</label>
              <input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button className="wp-btn primary" type="submit" disabled={busy}>
              {busy ? 'Mengirim…' : 'Kirim Tautan Reset'}
            </button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <Link to="/admin" style={{ fontSize: 13 }}>
                Kembali ke halaman masuk
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
