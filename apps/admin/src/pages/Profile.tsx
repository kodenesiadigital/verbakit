import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import { useAuth } from '../auth.tsx';

export function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [createdAt, setCreatedAt] = useState('');

  useEffect(() => {
    if (!user) return;
    api
      .get<{ user: { email: string; role: string; created_at: string } }>('/api/auth/me')
      .then((data) => {
        setEmail(data.user.email);
        setRole(data.user.role);
        setCreatedAt(data.user.created_at);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('Password baru tidak sama');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/auth/password', { currentPassword, newPassword });
      setNotice('Password berhasil diubah.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      <div className="wp-card">
        <h2>
          <Icon name="users" size={16} /> Informasi Akun
        </h2>
        <div className="wp-card-body">
          <div className="pb-row">
            <span className="label">Username</span>
            <span className="value">{user?.username}</span>
          </div>
          <div className="pb-row">
            <span className="label">Email</span>
            <span className="value">{email || '—'}</span>
          </div>
          <div className="pb-row">
            <span className="label">Peran</span>
            <span className="value">
              <span className={`wp-badge ${role || 'subscriber'}`}>{role}</span>
            </span>
          </div>
          <div className="pb-row">
            <span className="label">Bergabung</span>
            <span className="value">{createdAt ? new Date(createdAt).toLocaleDateString('id-ID') : '—'}</span>
          </div>
        </div>
      </div>

      <form className="wp-card" onSubmit={submit}>
        <h2>
          <Icon name="settings" size={16} /> Ganti Password
        </h2>
        <div className="wp-card-body">
          <div className="wp-form-row" style={{ maxWidth: 420 }}>
            <label htmlFor="currentPassword">Password saat ini</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="wp-form-row" style={{ maxWidth: 420 }}>
            <label htmlFor="newPassword">Password baru</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
            <p className="description">Minimal 8 karakter.</p>
          </div>
          <div className="wp-form-row" style={{ maxWidth: 420 }}>
            <label htmlFor="confirm">Ulangi password baru</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="wp-btn primary" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Ubah Password'}
          </button>
        </div>
      </form>
    </>
  );
}
