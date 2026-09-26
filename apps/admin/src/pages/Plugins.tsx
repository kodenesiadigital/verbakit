import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Icon } from '../icons.tsx';
import type { Plugin } from '@cms/core';

export function PluginsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'add' ? 'add' : 'installed';
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const data = await api.get<{ plugins: Plugin[] }>('/api/plugins');
      setPlugins(data.plugins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat plugin');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(plugin: Plugin) {
    setBusy(plugin.id);
    setError('');
    setNotice('');
    try {
      const action = plugin.status === 'active' ? 'deactivate' : 'activate';
      await api.post(`/api/plugins/${plugin.id}/${action}`);
      setNotice(`${plugin.name} berhasil ${action === 'activate' ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal');
    } finally {
      setBusy('');
    }
  }

  const isAdmin = user?.role === 'admin';
  const activeCount = plugins.filter((p) => p.status === 'active').length;

  return (
    <>
      <div className="wp-tabs">
        <a
          href="/plugins"
          className={tab === 'installed' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            setSearchParams({}, { replace: true });
          }}
        >
          Plugin Terpasang ({plugins.length})
        </a>
        <a
          href="/plugins?tab=add"
          className={tab === 'add' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            setSearchParams({ tab: 'add' }, { replace: true });
          }}
        >
          Tambah Plugin
        </a>
      </div>

      {tab === 'add' ? (
        <AddPluginPanel />
      ) : (
        <>
          {error && <div className="wp-notice error">{error}</div>}
          {notice && <div className="wp-notice success">{notice}</div>}

          <p className="muted">
            {activeCount} plugin aktif dari {plugins.length} terpasang. Plugin di-compile saat build
            (<code>npm run build:registry</code>) dan diaktifkan saat runtime.
          </p>

          {plugins.length === 0 ? (
            <div className="wp-empty">Belum ada plugin di registry.</div>
          ) : (
            <table className="wp-list">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Deskripsi</th>
                  <th>Versi</th>
                  <th>Status</th>
                  <th style={{ width: 160 }} />
                </tr>
              </thead>
              <tbody>
                {plugins.map((plugin) => (
                  <tr key={plugin.id}>
                    <td>
                      <strong>{plugin.name}</strong>
                      <div className="mono muted">{plugin.id}</div>
                    </td>
                    <td className="muted">{plugin.description ?? '—'}</td>
                    <td className="mono">{plugin.version}</td>
                    <td>
                      <span className={`wp-badge ${plugin.status}`}>{plugin.status}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="wp-row-actions">
                        <span>
                          <button
                            className="linklike"
                            disabled={!isAdmin || busy === plugin.id}
                            onClick={() => void toggle(plugin)}
                          >
                            <Icon name="check" size={14} />{' '}
                            {busy === plugin.id
                              ? 'Memproses…'
                              : plugin.status === 'active'
                                ? 'Nonaktifkan'
                                : 'Aktifkan'}
                          </button>
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isAdmin && <p className="muted">Hanya administrator yang dapat mengaktifkan plugin.</p>}
        </>
      )}
    </>
  );
}

function AddPluginPanel() {
  return (
    <>
      <div className="wp-card">
        <h2>
          <Icon name="plus" size={16} /> Tambah Plugin
        </h2>
        <div className="wp-card-body">
          <p>
            CMS Cloud memuat plugin saat <strong>build</strong>, jadi penambahan plugin dilakukan dengan meletakkan
            folder plugin di <code>plugins/&lt;nama-plugin&gt;</code> lalu menjalankan build ulang.
          </p>
          <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
            <li>
              Salin <code>plugins/hello-world</code> sebagai contoh, ganti nama folder dan isi{' '}
              <code>manifest.json</code>.
            </li>
            <li>
              Tulis entry plugin dengan <code>@cms/plugin-sdk</code>:{' '}
              <code>{'export default definePlugin((api) => { ... })'}</code>.
            </li>
            <li>
              Jalankan <code>npm run build:registry</code> lalu <code>npm run build</code>.
            </li>
            <li>Aktifkan plugin dari tab Plugin Terpasang.</li>
          </ol>
          <pre className="code-block">
            <code>{`// plugins/contoh/src/index.ts
import { definePlugin } from '@cms/plugin-sdk';

export default definePlugin((api) => {
  api.addFilter('content.render', (html) => \`\${html}<p>by Contoh</p>\`);
  api.registerAdminPage({
    slug: 'contoh',
    title: 'Contoh',
    render: async () => '<p>Halo dari plugin Contoh</p>',
  });
  return { activate: () => api.log('contoh aktif') };
});`}</code>
          </pre>
        </div>
      </div>
    </>
  );
}