import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';

type Section = 'general' | 'writing' | 'permalink';

const TABS: { key: Section; label: string; icon: string }[] = [
  { key: 'general', label: 'Umum', icon: 'settings' },
  { key: 'writing', label: 'Penulisan', icon: 'edit' },
  { key: 'permalink', label: 'Permalink', icon: 'blog' },
];

const PERMALINKS: { structure: string; label: string; example: string }[] = [
  { structure: '/blog/:slug', label: 'Nama Tulisan', example: '/blog/contoh-artikel' },
  { structure: '/:slug', label: 'Nama Tulisan', example: '/contoh-artikel' },
  { structure: '/artikel/:slug', label: 'Basis Kategori', example: '/artikel/contoh-artikel' },
];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const section: Section = raw === 'writing' ? 'writing' : raw === 'permalink' ? 'permalink' : 'general';
  const [options, setOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ options: Record<string, string> }>('/api/options')
      .then(({ options: data }) => setOptions(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan'));
  }, []);

  function update(name: string, value: string) {
    setOptions((current) => ({ ...current, [name]: value }));
  }

  function switchTab(key: Section) {
    setSearchParams(key === 'general' ? {} : { tab: key }, { replace: true });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.put('/api/options', { options });
      setNotice('Pengaturan tersimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  const permalinkStructure = options['permalink_structure'] ?? '/blog/:slug';

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      <div className="wp-tabs">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={tab.key === 'general' ? '/settings' : `/settings?tab=${tab.key}`}
            className={section === tab.key ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              switchTab(tab.key);
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <form onSubmit={save}>
        {section === 'general' && (
          <div className="wp-card">
            <h2>
              <Icon name="settings" size={16} /> Pengaturan Umum
            </h2>
            <div className="wp-card-body">
              <div className="wp-form-row">
                <label htmlFor="site_name">Nama Situs</label>
                <input
                  id="site_name"
                  type="text"
                  value={options['site_name'] ?? ''}
                  onChange={(e) => update('site_name', e.target.value)}
                  style={{ maxWidth: 420 }}
                />
                <p className="description">Dipakai di judul halaman, header, dan footer situs.</p>
              </div>
              <div className="wp-form-row">
                <label htmlFor="site_tagline">Tagline</label>
                <input
                  id="site_tagline"
                  type="text"
                  value={options['site_tagline'] ?? ''}
                  onChange={(e) => update('site_tagline', e.target.value)}
                  style={{ maxWidth: 420 }}
                />
              </div>
              <div className="wp-form-row" style={{ maxWidth: 220 }}>
                <label htmlFor="site_language">Bahasa Situs</label>
                <select
                  id="site_language"
                  value={options['site_language'] ?? 'id'}
                  onChange={(e) => update('site_language', e.target.value)}
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {section === 'writing' && (
          <div className="wp-card">
            <h2>
              <Icon name="edit" size={16} /> Penulisan
            </h2>
            <div className="wp-card-body">
              <div className="wp-form-row" style={{ maxWidth: 220 }}>
                <label htmlFor="posts_per_page">Jumlah artikel per halaman</label>
                <input
                  id="posts_per_page"
                  type="number"
                  min={1}
                  max={100}
                  value={options['posts_per_page'] ?? '10'}
                  onChange={(e) => update('posts_per_page', e.target.value)}
                />
                <p className="description">Dipakai untuk arsip /blog dan sitemap.</p>
              </div>
              <div className="wp-form-row">
                <label htmlFor="default_category">Kategori bawaan</label>
                <input
                  id="default_category"
                  type="text"
                  value={options['default_category'] ?? ''}
                  onChange={(e) => update('default_category', e.target.value)}
                  placeholder="Uncategorized"
                  style={{ maxWidth: 320 }}
                />
              </div>
            </div>
          </div>
        )}

        {section === 'permalink' && (
          <div className="wp-card">
            <h2>
              <Icon name="blog" size={16} /> Struktur Permalink
            </h2>
            <div className="wp-card-body">
              <p className="muted" style={{ marginTop: 0 }}>
                Pilih struktur tautan permanen untuk artikel.
              </p>
              {PERMALINKS.map((item) => (
                <label key={item.structure} className="permalink-choice">
                  <input
                    type="radio"
                    name="permalink"
                    value={item.structure}
                    checked={permalinkStructure === item.structure}
                    onChange={() => update('permalink_structure', item.structure)}
                  />
                  <span className="pc-text">
                    {item.label}
                    <code>{item.example}</code>
                  </span>
                </label>
              ))}
              <div className="wp-form-row" style={{ marginTop: 14 }}>
                <label htmlFor="permalink_structure">Struktur kustom</label>
                <input
                  id="permalink_structure"
                  type="text"
                  value={permalinkStructure}
                  onChange={(e) => update('permalink_structure', e.target.value)}
                  style={{ maxWidth: 320 }}
                />
                <p className="description">Gunakan <code>:slug</code> sebagai placeholder slug artikel.</p>
              </div>
            </div>
          </div>
        )}

        <div style={{ margin: '4px 0 20px' }}>
          <button className="wp-btn primary" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>
    </>
  );
}