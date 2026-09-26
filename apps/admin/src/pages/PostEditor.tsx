import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import { siteUrl } from '../site.ts';
import { TaxonomyPanel, type TermSelection } from './TaxonomyPanel.tsx';
import { MediaPicker } from './MediaPicker.tsx';
import type { Post, Term } from '@pressforge/core';

interface Revision {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export function PostEditorPage({ type }: { type: 'post' | 'page' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const basePath = type === 'page' ? '/pages' : '/posts';
  const isNew = !id;

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'publish'>('draft');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [permalinkStructure, setPermalinkStructure] = useState('/blog/:slug');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermSelection>({ categories: [], tags: [] });

  const loadRevisions = useCallback((postId: string) => {
    api
      .get<{ revisions: Revision[] }>(`/api/posts/${postId}/revisions`)
      .then((data) => setRevisions(data.revisions))
      .catch(() => setRevisions([]));
  }, []);

  useEffect(() => {
    api
      .get<{ options: Record<string, string> }>('/api/options')
      .then(({ options }) => setPermalinkStructure(options.permalink_structure ?? '/blog/:slug'))
      .catch(() => undefined);
    if (isNew) return;
    api
      .get<{ post: Post & { terms?: Term[] } }>(`/api/posts/${id}`)
      .then(({ post }) => {
        setTitle(post.title);
        setSlug(post.slug);
        setExcerpt(post.excerpt);
        setContent(post.content);
        setStatus(post.status === 'publish' ? 'publish' : 'draft');
        setUpdatedAt(post.updatedAt);
        setFeaturedImage(post.featuredImage ?? null);
        setTerms({
          categories: (post.terms ?? []).filter((t) => t.kind === 'category').map((t) => t.id),
          tags: (post.terms ?? []).filter((t) => t.kind === 'tag').map((t) => t.id),
        });
        loadRevisions(post.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat item'));
  }, [id, isNew, loadRevisions]);

  // Peringatan ala WordPress: konfirmasi sebelum menutup halaman saat unsaved.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const permalink = (permalinkStructure.replace(':slug', slug || 'slug')).replace(/^\/?/, '/');

  async function save(nextStatus: 'draft' | 'publish') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        title,
        slug: slug || undefined,
        excerpt,
        content,
        status: nextStatus,
        type,
        featuredImage: featuredImage ?? '',
        categories: terms.categories,
        tags: terms.tags,
      };
      const result = isNew
        ? await api.post<{ post: Post }>('/api/posts', payload)
        : await api.put<{ post: Post }>(`/api/posts/${id}`, payload);
      setNotice('Tersimpan.');
      setStatus(nextStatus);
      setSlug(result.post.slug);
      setUpdatedAt(result.post.updatedAt);
      setDirty(false);
      // Setelah simpan, term baru sudah punya id; segarkan agar checkbox sinkron.
      api
        .get<{ post: Post & { terms?: Term[] } }>(`/api/posts/${result.post.id}`)
        .then(({ post }) => {
          setTerms({
            categories: (post.terms ?? []).filter((t) => t.kind === 'category').map((t) => t.id),
            tags: (post.terms ?? []).filter((t) => t.kind === 'tag').map((t) => t.id),
          });
        })
        .catch(() => undefined);
      loadRevisions(result.post.id);
      if (isNew) navigate(`${basePath}/${result.post.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save(status);
  }

  async function restore(revisionId: string) {
    if (!id) return;
    if (!confirm('Pulihkan versi ini? Versi sekarang akan disimpan sebagai revisi.')) return;
    try {
      const result = await api.post<{ post: Post }>(`/api/posts/${id}/revisions/${revisionId}/restore`);
      setTitle(result.post.title);
      setSlug(result.post.slug);
      setExcerpt(result.post.excerpt);
      setContent(result.post.content);
      setStatus(result.post.status === 'publish' ? 'publish' : 'draft');
      setNotice('Revisi dipulihkan.');
      setDirty(false);
      loadRevisions(result.post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulihkan revisi');
    }
  }

  return (
    <>
      <div className="wp-page-title">
        <h1>
          <Icon name="edit" size={24} />
          <span>
            {isNew ? (type === 'page' ? 'Tambah Halaman' : 'Tambah Artikel Baru') : 'Edit Artikel'}
            {dirty ? ' •' : ''}
          </span>
        </h1>
        <div className="heading-actions">
          <Link className="wp-btn" to={basePath}>
            Kembali ke Daftar
          </Link>
        </div>
      </div>

      {error && <div className="wp-notice error">{error}</div>}
      {notice && <div className="wp-notice success">{notice}</div>}

      <form className="wp-editor-grid" onSubmit={handleSubmit}>
        <div className="wp-card">
          <h2>
            <Icon name="post" size={16} /> {isNew ? 'Tambah' : 'Edit'} {type === 'page' ? 'Halaman' : 'Artikel'}
          </h2>
          <div className="wp-card-body">
            <div className="wp-form-row">
              <label htmlFor="title">Judul</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                required
              />
            </div>

            <div className="wp-form-row">
              <label htmlFor="excerpt">Ringkasan</label>
              <input
                id="excerpt"
                type="text"
                value={excerpt}
                onChange={(e) => {
                  setExcerpt(e.target.value);
                  setDirty(true);
                }}
              />
              <p className="description">Tampil di daftar artikel dan meta description.</p>
            </div>

            <div className="wp-form-row">
              <label htmlFor="content">Konten</label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
              />
              <p className="description">
                Markdown didukung: <code># heading</code>, <code>**tebal**</code>, <code>*miring*</code>,{' '}
                <code>&gt; kutipan</code>, daftar, kode.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="wp-publishbox">
            <div className="pb-head">
              <span>Publikasi</span>
              <span className={`wp-badge ${status}`}>{status}</span>
            </div>
            <div className="pb-body">
              <div className="wp-form-row">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as 'draft' | 'publish');
                    setDirty(true);
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="publish">Published</option>
                </select>
              </div>

              <div className="wp-form-row">
                <label htmlFor="slug">Slug</label>
                <input
                  id="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="otomatis dari judul"
                />
              </div>

              <div className="pb-row">
                <span className="label">Permalink</span>
              </div>
              <div className="permalink-box">
                {siteUrl(type === 'page' ? `/${slug || 'slug'}` : permalink)}
              </div>

              {updatedAt && (
                <div className="pb-row" style={{ marginTop: 8 }}>
                  <span className="label">Diperbarui</span>
                  <span className="value">{new Date(updatedAt).toLocaleString('id-ID')}</span>
                </div>
              )}

              <div className="pb-actions">
                <button className="wp-btn primary large" type="submit" disabled={busy}>
                  <Icon name="check" size={16} /> {busy ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button className="wp-btn" type="button" disabled={busy} onClick={() => void save('draft')}>
                  Simpan Draft
                </button>
                <button className="wp-btn" type="button" disabled={busy} onClick={() => void save('publish')}>
                  Publish
                </button>
                {status === 'publish' && !isNew && (
                  <a className="wp-btn" href={siteUrl(permalink)} target="_blank" rel="noreferrer">
                    <Icon name="screen" size={14} /> Lihat Artikel
                  </a>
                )}
                {status === 'draft' && !isNew && (
                  <button
                    className="wp-btn danger"
                    type="button"
                    onClick={async () => {
                      if (!confirm('Pindahkan ke sampah?')) return;
                      await api.patch(`/api/posts/${id}`);
                      navigate(basePath);
                    }}
                  >
                    Pindahkan ke Sampah
                  </button>
                )}
              </div>
            </div>
          </div>

          <MediaPicker value={featuredImage} onChange={setFeaturedImage} />
          <TaxonomyPanel value={terms} onChange={setTerms} />

          {!isNew && (
            <div className="wp-publishbox" style={{ marginTop: 16 }}>
              <div className="pb-head">
                <span>Revisi</span>
                <span className="muted">{revisions.length} tersedia</span>
              </div>
              <div className="pb-body">
                {revisions.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Belum ada revisi. Revisi dibuat otomatis setiap kali artikel disimpan.
                  </p>
                ) : (
                  <ul className="revisions-list">
                    {revisions.map((revision) => (
                      <li key={revision.id}>
                        <span>
                          {new Date(revision.createdAt).toLocaleString('id-ID')}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {revision.title || '(tanpa judul)'}
                          </div>
                        </span>
                        <button className="wp-btn" onClick={() => void restore(revision.id)}>
                          <Icon name="undo" size={14} /> Pulihkan
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </form>
    </>
  );
}