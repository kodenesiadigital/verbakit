import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';

interface ServicePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  endpoint: string;
  capabilities: string[];
  status: 'active' | 'inactive';
  hasSecret: boolean;
}

interface TestResult {
  ok: boolean;
  result: { status: number; durationMs: number; error?: string };
}

const CAPABILITY_LABELS: Record<string, string> = {
  'read:options': 'Baca pengaturan situs',
  'write:own_options': 'Tulis pengaturannya sendiri',
};

export function ServicePluginsPanel() {
  const [plugins, setPlugins] = useState<ServicePlugin[]>([]);
  const [manifestUrl, setManifestUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editEndpoint, setEditEndpoint] = useState('');

  async function load() {
    try {
      const data = await api.get<{ plugins: ServicePlugin[] }>('/api/plugins/service');
      setPlugins(data.plugins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat plugin service');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function install(event: FormEvent) {
    event.preventDefault();
    setBusy('install');
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ plugin: ServicePlugin }>('/api/plugins/service', {
        manifestUrl,
        secret,
      });
      setNotice(`Plugin "${result.plugin.name}" dipasang. Aktifkan saat siap dipakai.`);
      setManifestUrl('');
      setSecret('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pemasangan gagal');
    } finally {
      setBusy('');
    }
  }

  async function toggle(plugin: ServicePlugin) {
    setBusy(plugin.id);
    setError('');
    setNotice('');
    try {
      await api.post(`/api/plugins/service/${plugin.id}/${plugin.status === 'active' ? 'deactivate' : 'activate'}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal');
    } finally {
      setBusy('');
    }
  }

  async function test(plugin: ServicePlugin) {
    setBusy(plugin.id);
    setError('');
    setNotice('');
    try {
      const data = await api.post<TestResult>(`/api/plugins/service/${plugin.id}/test`);
      setNotice(
        data.ok
          ? `${plugin.name} merespons 200 dalam ${data.result.durationMs}ms.`
          : `${plugin.name} gagal: ${data.result.error ?? `HTTP ${data.result.status}`}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uji gagal');
    } finally {
      setBusy('');
    }
  }

  async function saveEndpoint(plugin: ServicePlugin) {
    setBusy(plugin.id);
    try {
      await api.put(`/api/plugins/service/${plugin.id}`, { endpoint: editEndpoint });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan endpoint');
    } finally {
      setBusy('');
    }
  }

  async function uninstall(plugin: ServicePlugin) {
    if (!confirm(`Copot plugin "${plugin.name}"?`)) return;
    setBusy(plugin.id);
    try {
      await api.delete(`/api/plugins/service/${plugin.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencopot');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="wp-card">
      <h2>
        <Icon name="plugin" size={16} /> Plugin Service (Marketplace)
      </h2>
      <div className="wp-card-body">
        {error && <div className="wp-notice error">{error}</div>}
        {notice && <div className="wp-notice success">{notice}</div>}

        <p className="muted" style={{ marginTop: 0 }}>
          Plugin service berjalan sebagai layanan HTTP terpisah, bukan di dalam proses CMS. Pasang lewat
          URL manifest — tanpa perlu build ulang. Hook yang dikirim hanya event pada jalur admin &amp; cron;
          halaman publik tetap 100% plugin bawaan.
        </p>

        <form onSubmit={install} className="wp-install-form">
          <div className="wp-form-row">
            <label htmlFor="manifestUrl">URL manifest</label>
            <input
              id="manifestUrl"
              type="url"
              value={manifestUrl}
              onChange={(e) => setManifestUrl(e.target.value)}
              placeholder="https://plugin.example.com/manifest.json"
              required
            />
          </div>
          <div className="wp-form-row">
            <label htmlFor="secret">Shared secret (opsional)</label>
            <input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="dipakai untuk menandatangani setiap request"
              autoComplete="off"
            />
            <p className="description">
              Disimpan terenkripsi di sisi server dan tidak pernah dikembalikan ke antarmuka.
            </p>
          </div>
          <button className="wp-btn primary" type="submit" disabled={busy === 'install'}>
            <Icon name="plus" size={14} /> {busy === 'install' ? 'Memasang…' : 'Pasang Plugin'}
          </button>
        </form>

        {plugins.length === 0 ? (
          <div className="wp-empty" style={{ marginTop: 14 }}>
            Belum ada plugin service yang terpasang.
          </div>
        ) : (
          <table className="wp-list" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Endpoint</th>
                <th>Kapabilitas</th>
                <th>Status</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {plugins.map((plugin) => (
                <tr key={plugin.id}>
                  <td>
                    <strong>{plugin.name}</strong>
                    <div className="mono muted">
                      {plugin.id} v{plugin.version}
                    </div>
                    {plugin.description && <div className="muted">{plugin.description}</div>}
                  </td>
                  <td className="mono">
                    {editing === plugin.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="url"
                          value={editEndpoint}
                          onChange={(e) => setEditEndpoint(e.target.value)}
                        />
                        <button className="wp-btn" onClick={() => void saveEndpoint(plugin)}>
                          Simpan
                        </button>
                        <button className="wp-btn" onClick={() => setEditing(null)}>
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div>{plugin.endpoint}</div>
                        <button
                          className="linklike"
                          onClick={() => {
                            setEditing(plugin.id);
                            setEditEndpoint(plugin.endpoint);
                          }}
                        >
                          ubah
                        </button>
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {plugin.hasSecret ? 'secret tersimpan' : 'tanpa secret'}
                    </div>
                  </td>
                  <td>
                    {plugin.capabilities.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      plugin.capabilities.map((cap) => (
                        <span className="term-chip" key={cap}>
                          {CAPABILITY_LABELS[cap] ?? cap}
                        </span>
                      ))
                    )}
                  </td>
                  <td>
                    <span className={`wp-badge ${plugin.status}`}>{plugin.status}</span>
                  </td>
                  <td>
                    <div className="wp-row-actions">
                      <span>
                        <button className="linklike" disabled={busy === plugin.id} onClick={() => void test(plugin)}>
                          <Icon name="search" size={13} /> Uji
                        </button>
                      </span>
                      <span>
                        <button className="linklike" disabled={busy === plugin.id} onClick={() => void toggle(plugin)}>
                          <Icon name="check" size={13} />
                          {plugin.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </span>
                      <span className="trash">
                        <button className="linklike" disabled={busy === plugin.id} onClick={() => void uninstall(plugin)}>
                          <Icon name="trash" size={13} /> Copot
                        </button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
