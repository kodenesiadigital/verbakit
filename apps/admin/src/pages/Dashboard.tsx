import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { siteUrl, adminUrl } from '../site.ts';
import { Icon } from '../icons.tsx';

interface SystemStatus {
  name: string;
  version: string;
  counts: { posts: number; pages: number; users: number; activePlugins: number };
  siteName: string;
}

export function DashboardPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<{ id: string; title: string; status: string; updatedAt: string }[]>([]);

  useEffect(() => {
    api
      .get<SystemStatus>('/api/system/status')
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat status'));
    api
      .get<{ posts: { id: string; title: string; status: string; updatedAt: string }[] }>(
        '/api/posts?type=post&status=all&per_page=5',
      )
      .then((data) => setRecent(data.posts))
      .catch(() => undefined);
  }, []);

  if (error) return <div className="wp-notice error">{error}</div>;
  if (!status) return <div className="wp-empty">Memuat…</div>;

  return (
    <>
      <div className="wp-dashboard-columns">
        <div className="wp-widget">
          <h2>
            <Icon name="chart" size={16} /> Ringkasan
          </h2>
          <div className="wp-widget-body">
            <div className="wp-stat-row">
              <span>Artikel</span>
              <span className="value">{status.counts.posts}</span>
            </div>
            <div className="wp-stat-row">
              <span>Halaman</span>
              <span className="value">{status.counts.pages}</span>
            </div>
            <div className="wp-stat-row">
              <span>Pengguna</span>
              <span className="value">{status.counts.users}</span>
            </div>
            <div className="wp-stat-row">
              <span>Plugin aktif</span>
              <span className="value">{status.counts.activePlugins}</span>
            </div>
          </div>
        </div>

        <div className="wp-widget">
          <h2>
            <Icon name="update" size={16} /> Aktivitas
          </h2>
          <div className="wp-widget-body">
            {recent.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Belum ada artikel.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {recent.map((post) => (
                  <li key={post.id} className="wp-stat-row">
                    <a href={adminUrl(`/posts/${post.id}`)}>{post.title || '(tanpa judul)'}</a>
                    <span className={`wp-badge ${post.status}`}>{post.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="wp-widget">
          <h2>
            <Icon name="settings" size={16} /> Situs &amp; SEO
          </h2>
          <div className="wp-widget-body">
            <p style={{ marginTop: 0 }}>
              <strong>{status.siteName}</strong> — {status.name} v{status.version}
            </p>
            <p className="muted">
              Sitemap: <a href={siteUrl('/sitemap.xml')} target="_blank" rel="noreferrer">/sitemap.xml</a> &middot;{' '}
              <a href={siteUrl('/robots.txt')} target="_blank" rel="noreferrer">/robots.txt</a>
            </p>
            <p className="muted">
              Pratinjau situs:{' '}
              <a href={siteUrl('/')} target="_blank" rel="noreferrer">buka situs</a>
            </p>
          </div>
        </div>
      </div>

      <div className="wp-widget" style={{ marginTop: 16 }}>
          <h2>
            <Icon name="star" size={16} /> Aksi cepat
          </h2>
        <div className="wp-widget-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="wp-btn primary" href={adminUrl('/posts/new')}>
            Tulis Artikel
          </a>
          <a className="wp-btn" href={adminUrl('/pages/new')}>
            Buat Halaman
          </a>
          <a className="wp-btn" href={adminUrl('/media')}>
            Upload Media
          </a>
          <a className="wp-btn" href={adminUrl('/plugins')}>
            Kelola Plugin
          </a>
        </div>
      </div>
    </>
  );
}