import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import { siteUrl } from '../site.ts';

interface Theme {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  status: 'active' | 'inactive';
}

export function ThemesPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'customize' ? 'customize' : 'themes';
  const [themes, setThemes] = useState<Theme[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api
      .get<{ themes: Theme[] }>('/api/themes')
      .then((data) => setThemes(data.themes))
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat tema'));
  }, []);

  async function activate(id: string) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await api.post(`/api/themes/${id}/activate`);
      setNotice('Tema berhasil diaktifkan.');
      const data = await api.get<{ themes: Theme[] }>('/api/themes');
      setThemes(data.themes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengaktifkan tema');
    } finally {
      setBusy('');
    }
  }

  if (tab === 'customize') {
    return <CustomizePanel notice={notice} setNotice={setNotice} error={error} setError={setError} themes={themes} />;
  }

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}
      <div className="wp-dashboard-columns">
        {themes.map((theme) => (
          <div className="wp-widget" key={theme.id}>
            <h2>
              <Icon name="appearance" size={16} /> {theme.name}{' '}
              {theme.status === 'active' && <span className="flag-active">&mdash; Aktif</span>}
            </h2>
            <div className="wp-widget-body">
              <div
                className="theme-swatch"
                style={{ height: 90, background: '#f6f7f7', border: '1px solid #dcdcde', marginBottom: 10, display: 'grid', placeItems: 'center', color: '#8c8f94' }}
              >
                Pratinjau Tema
              </div>
              <p style={{ marginTop: 0 }}>{theme.description}</p>
              <p className="muted mono">
                Versi {theme.version} &middot; oleh {theme.author}
              </p>
              <button
                className="wp-btn primary"
                disabled={theme.status === 'active' || busy === theme.id}
                onClick={() => void activate(theme.id)}
              >
                {theme.status === 'active' ? 'Aktif' : busy === theme.id ? 'Memproses…' : 'Aktifkan'}
              </button>
              <a className="wp-btn" style={{ marginLeft: 6 }} href={siteUrl('/')} target="_blank" rel="noreferrer">
                Lihat situs
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Tema bawaan Verbakit. Plugin dapat menambah tema baru lewat registry saat build.
      </p>
    </>
  );
}

function CustomizePanel({
  notice,
  setNotice,
  error,
  setError,
  themes,
}: {
  notice: string;
  setNotice: (value: string) => void;
  error: string;
  setError: (value: string) => void;
  themes: Theme[];
}) {
  const [options, setOptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ options: Record<string, string> }>('/api/options')
      .then(({ options: data }) => setOptions(data))
      .catch(() => undefined);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.put('/api/options', { options });
      setNotice('Identitas situs disimpan. Halaman publik langsung memakainya.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  const active = themes.find((theme) => theme.status === 'active');

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      <form className="wp-card" onSubmit={save}>
        <h2>
          <Icon name="settings" size={16} /> Identitas Situs
        </h2>
        <div className="wp-card-body">
          <div className="wp-form-row">
            <label htmlFor="site_name">Nama Situs</label>
            <input
              id="site_name"
              type="text"
              value={options['site_name'] ?? ''}
              onChange={(e) => setOptions((current) => ({ ...current, site_name: e.target.value }))}
              style={{ maxWidth: 420 }}
            />
            <p className="description">Dipakai di header situs, footer, dan judul halaman.</p>
          </div>
          <div className="wp-form-row">
            <label htmlFor="site_tagline">Tagline</label>
            <input
              id="site_tagline"
              type="text"
              value={options['site_tagline'] ?? ''}
              onChange={(e) => setOptions((current) => ({ ...current, site_tagline: e.target.value }))}
              style={{ maxWidth: 420 }}
            />
          </div>
          <div className="wp-form-row">
            <label htmlFor="site_language">Bahasa</label>
            <select
              id="site_language"
              value={options['site_language'] ?? 'id'}
              onChange={(e) => setOptions((current) => ({ ...current, site_language: e.target.value }))}
              style={{ maxWidth: 200 }}
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>
          <button className="wp-btn primary" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
          <a className="wp-btn" style={{ marginLeft: 6 }} href={siteUrl('/')} target="_blank" rel="noreferrer">
            Lihat situs
          </a>
        </div>
      </form>

      <div className="wp-widget">
        <h2>
          <Icon name="appearance" size={16} /> Widget (area tema)
        </h2>
        <div className="wp-widget-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Tema aktif: <strong>{active?.name ?? '—'}</strong>. Area widget di bawah ini akan disambungkan ke
            shortcode yang disediakan tema.
          </p>
          <ul>
            <li>Sidebar: daftar artikel terbaru</li>
            <li>Sidebar: arsip bulan</li>
            <li>Footer: tautan situs</li>
          </ul>
        </div>
      </div>
    </>
  );
}