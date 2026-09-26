import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import type { User } from '@pressforge/core';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  editor: 'Editor',
  author: 'Author',
  subscriber: 'Subscriber',
};

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(searchParams.get('action') === 'add');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('author');

  useEffect(() => {
    if (searchParams.get('action') === 'add') setOpen(true);
  }, [searchParams]);

  function closeForm() {
    setOpen(false);
    if (searchParams.get('action')) {
      const params = new URLSearchParams(searchParams);
      params.delete('action');
      setSearchParams(params, { replace: true });
    }
  }

  async function load() {
    try {
      const data = await api.get<{ users: User[] }>('/api/users');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengguna');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/users', { username, email, password, role });
      setNotice(`Pengguna "${username}" dibuat.`);
      setUsername('');
      setEmail('');
      setPassword('');
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat pengguna');
    }
  }

  async function changeRole(user: User, nextRole: string) {
    try {
      await api.put(`/api/users/${user.id}`, { role: nextRole });
      setNotice(`Peran ${user.username} diubah ke ${ROLE_LABELS[nextRole] ?? nextRole}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah peran');
    }
  }

  async function remove(id: string) {
    if (!confirm('Hapus pengguna ini?')) return;
    try {
      await api.delete(`/api/users/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pengguna');
    }
  }

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      {open && (
        <form className="wp-card" onSubmit={addUser}>
          <h2>
            <Icon name="plus" size={16} /> Tambah Pengguna Baru
          </h2>
          <div className="wp-card-body">
            <div className="wp-inline-fields">
              <div className="wp-form-row">
                <label htmlFor="new-username">Username</label>
                <input id="new-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="wp-form-row">
                <label htmlFor="new-email">Email</label>
                <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="wp-inline-fields">
              <div className="wp-form-row">
                <label htmlFor="new-password">Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="description">Minimal 8 karakter.</p>
              </div>
              <div className="wp-form-row">
                <label htmlFor="new-role">Peran</label>
                <select id="new-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="wp-btn primary" type="submit">
                Tambah Pengguna
              </button>
          <button className="wp-btn" type="button" onClick={closeForm}>
            Batal
          </button>
            </div>
          </div>
        </form>
      )}

      <table className="wp-list">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Peran</th>
            <th>Bergabung</th>
            <th style={{ width: 220 }} />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <strong>{user.username}</strong>
              </td>
              <td>
                <a href={`mailto:${user.email}`}>{user.email}</a>
              </td>
              <td>
                <select value={user.role} onChange={(e) => void changeRole(user, e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>{' '}
                <span className={`wp-badge ${user.role}`}>{ROLE_LABELS[user.role] ?? user.role}</span>
              </td>
              <td className="muted">{new Date(user.createdAt).toLocaleDateString('id-ID')}</td>
              <td style={{ textAlign: 'right' }}>
                <div className="wp-row-actions">
                  <span>
                    <a href={`mailto:${user.email}`}>Kirim email</a>
                  </span>
                  <span className="trash">
                    <a href="#" onClick={(e) => { e.preventDefault(); void remove(user.id); }}>
                      Hapus
                    </a>
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <button className="wp-btn primary" onClick={() => (open ? closeForm() : setOpen(true))}>
          <Icon name="plus" size={14} /> {open ? 'Tutup formulir' : 'Tambah Pengguna Baru'}
        </button>
      </div>
    </>
  );
}