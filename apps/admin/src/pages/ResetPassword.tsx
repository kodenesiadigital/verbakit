import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';

/** Halaman "/admin/reset?token=..." — menyelesaikan reset password. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Password tidak sama');
      return;
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>Password Baru</h1>
        <p className="sub">Masukkan password baru untuk akun Anda</p>
        {error && <div className="wp-notice error">{error}</div>}
        {done ? (
          <>
            <div className="wp-notice success">Password berhasil diubah. Silakan masuk dengan password baru.</div>
            <Link className="wp-btn primary" to="/">
              Masuk
            </Link>
          </>
        ) : !token ? (
          <>
            <div className="wp-notice error">Tautan tidak lengkap — token reset tidak ditemukan.</div>
            <Link className="wp-btn" to="/lupa-password">
              Minta tautan baru
            </Link>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="password">Password baru</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                minLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Ulangi password baru</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button className="wp-btn primary" type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan Password Baru'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
