import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';

/**
 * Wizard first-run.
 *
 * Muncul hanya saat instalasi belum punya pengguna sama sekali. Owners
 * non-teknis cukup membuka dasbor, membuat akun, dan password-nya sendiri -
 * tanpa perlu terminal, tanpa secrets yang harus diingat.
 */
export function SetupWizard({ onSelesai }: { onSelesai: () => void }) {
  const [siteName, setSiteName] = useState('Situs Saya');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Password tidak sama');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/setup/admin', { username, email, password, siteName });
      onSelesai();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={submit} style={{ width: 380 }}>
        <h1>Selamat datang di Verbakit</h1>
        <p className="sub">Langkah pertama: buat akun administrator Anda.</p>

        {error && <div className="wp-notice error">{error}</div>}

        <div>
          <label htmlFor="siteName">Nama situs</label>
          <input
            id="siteName"
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="username">Nama pengguna</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div>
          <label htmlFor="confirm">Ulangi password</label>
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
          {busy ? 'Menyimpan…' : 'Buat akun & mulai'}
        </button>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
          Password minimal 8 karakter. Anda yang menentukannya, jadi tidak perlu ada yang dicatat di mana pun.
        </p>
      </form>
    </div>
  );
}
