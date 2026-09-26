import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';

interface MediaItem {
  key: string;
  size: number;
  uploaded?: string;
  etag?: string;
}

export function MediaPage() {
  const [searchParams] = useSearchParams();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(searchParams.get('action') === 'upload');
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get('action') !== 'upload') return;
    setUploading(true);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    inputRef.current?.focus();
  }, [searchParams]);

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

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.upload('/api/media/upload', form);
      }
      setNotice(`${files.length} file berhasil diunggah.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload gagal');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      <div className="wp-card" ref={formRef}>
        <h2>
          <Icon name="plus" size={16} /> Upload Berkas
          {uploading && <span className="flag-active" style={{ marginLeft: 8 }}>pilih berkas di bawah</span>}
        </h2>
        <div className="wp-card-body">
          <div className="wp-form-row">
            <label htmlFor="files">Pilih berkas</label>
            <input
              id="files"
              ref={inputRef}
              type="file"
              multiple
              disabled={busy}
              onChange={(e) => void upload(e.target.files)}
            />
            <p className="description">Berkas disimpan di bucket Cloudflare R2.</p>
          </div>
          {busy && <p className="muted">Mengunggah…</p>}
        </div>
      </div>

      <div className="wp-card">
        <h2>
          <Icon name="media" size={16} /> Perpustakaan Media ({media.length})
        </h2>
        <div className="wp-card-body">
          {media.length === 0 ? (
            <div className="wp-empty">Belum ada media.</div>
          ) : (
            <table className="wp-list" style={{ border: 'none' }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Pratinjau</th>
                  <th>Nama berkas</th>
                  <th>Ukuran</th>
                  <th>Diunggah</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {media.map((item) => (
                  <tr key={item.key}>
                    <td>
                      {/\.(png|jpe?g|gif|webp|svg)$/i.test(item.key) ? (
                        <img className="wp-thumb" src={`/api/media/${item.key}`} alt={item.key} />
                      ) : (
                        <span className="muted">&mdash;</span>
                      )}
                    </td>
                    <td className="mono">{item.key}</td>
                    <td>{(item.size / 1024).toFixed(1)} KB</td>
                    <td className="muted">
                      {item.uploaded ? new Date(item.uploaded).toLocaleString('id-ID') : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="wp-row-actions">
                        <span>
                          <a href={`/api/media/${item.key}`} target="_blank" rel="noreferrer">
                            Lihat
                          </a>
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
    </>
  );
}