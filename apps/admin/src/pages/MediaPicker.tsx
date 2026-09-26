import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';

interface MediaItem {
  key: string;
  size: number;
  uploaded?: string;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** Pemilih gambar utama: daftar media, unggah baru, atau kosongkan. */
export function MediaPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api.get<{ media: MediaItem[] }>('/api/media');
      setMedia(data.media);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat media');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.upload<{ media: { key: string } }>('/api/media/upload', form);
      onChange(result.media.key);
      await load();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload gagal');
    } finally {
      setBusy(false);
    }
  }

  const preview = value ? `/api/media/${value}` : null;

  return (
    <div className="wp-publishbox" style={{ marginTop: 16 }}>
      <div className="pb-head">
        <span>Gambar Utama</span>
        {value && (
          <button className="linklike" onClick={() => onChange(null)}>
            Hapus
          </button>
        )}
      </div>
      <div className="pb-body">
        {error && <div className="wp-notice error">{error}</div>}
        {preview ? (
          <div className="featured-preview">
            <img src={preview} alt="Gambar utama" />
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>Belum ada gambar utama.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="wp-btn" type="button" onClick={() => setOpen((v) => !v)} disabled={busy}>
            <Icon name="media" size={14} /> Pilih dari Media
          </button>
          <label className="wp-btn" style={{ cursor: 'pointer' }}>
            <Icon name="plus" size={14} /> {busy ? 'Mengunggah…' : 'Unggah Baru'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {open && (
          <div className="media-picker">
            {media.filter((item) => IMAGE_RE.test(item.key)).length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Belum ada gambar di perpustakaan media.</p>
            ) : (
              <div className="media-grid">
                {media
                  .filter((item) => IMAGE_RE.test(item.key))
                  .map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`media-cell${value === item.key ? ' is-selected' : ''}`}
                      title={item.key}
                      onClick={() => {
                        onChange(item.key);
                        setOpen(false);
                      }}
                    >
                      <img src={`/api/media/${item.key}`} alt={item.key} loading="lazy" />
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
