import { adminUrl } from '../site.ts';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import type { Post } from '@pressforge/core';

const STATUS_LABELS: Record<string, string> = {
  all: 'Semua status',
  publish: 'Published',
  draft: 'Draft',
  trash: 'Trash',
};

export function PostsPage({ type }: { type: 'post' | 'page' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [search, setSearch] = useState(searchParams.get('s') ?? '');
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get('s') ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const basePath = type === 'page' ? '/pages' : '/posts';

  // Ikuti perubahan URL (klik submenu sidebar / tab) — jangan hanya saat mount.
  useEffect(() => {
    const nextStatus = searchParams.get('status') ?? 'all';
    const nextSearch = searchParams.get('s') ?? '';
    setStatus((current) => (current === nextStatus ? current : nextStatus));
    setSearch((current) => (current === nextSearch ? current : nextSearch));
    setAppliedSearch((current) => (current === nextSearch ? current : nextSearch));
  }, [searchParams]);

  async function load() {
    setError('');
    try {
      const params = new URLSearchParams({ type, status, per_page: '50' });
      if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
      const data = await api.get<{ posts: Post[]; total: number }>(`/api/posts?${params.toString()}`);
      setPosts(data.posts);
      setTotal(data.total);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, status, appliedSearch]);

  function syncUrl(nextStatus: string, nextSearch: string) {
    const params = new URLSearchParams();
    if (nextStatus !== 'all') params.set('status', nextStatus);
    if (nextSearch) params.set('s', nextSearch);
    setSearchParams(params, { replace: true });
  }
  const allSelected = posts.length > 0 && selected.length === posts.length;

  const selectedIds = useMemo(() => selected, [selected]);

  async function remove(id: string) {
    if (!confirm('Hapus permanen item ini?')) return;
    await api.delete(`/api/posts/${id}`);
    await load();
  }

  async function bulkApply(action: string) {
    if (!confirm(`Terapkan "${action}" pada ${selectedIds.length} item?`)) return;
    setError('');
    try {
      await api.post('/api/posts/bulk', { ids: selectedIds, action });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal');
    }
  }

  return (
    <>
      {error && <div className="wp-notice error">{error}</div>}

      <form
        className="wp-card"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedSearch(search.trim());
          syncUrl(status, search.trim());
        }}
      >
        <div className="wp-card-body">
          <div className="wp-inline-fields">
            <div className="wp-form-row" style={{ marginBottom: 0 }}>
              <label htmlFor="search">Cari</label>
              <input
                id="search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Judul atau isi…"
              />            </div>
            <div className="wp-form-row" style={{ marginBottom: 0, maxWidth: 180 }}>
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="wp-btn" type="submit">
              <Icon name="search" size={14} /> Cari
            </button>
          </div>
        </div>
      </form>

      <div className="wp-tabs">
        {(
          [
            ['all', 'Semua'],
            ['publish', 'Published'],
            ['draft', 'Draft'],
            ['trash', 'Sampah'],
          ] as const
        ).map(([value, label]) => (
          <a
            key={value}
            href={adminUrl(`${basePath}${value === 'all' ? '' : `?status=${value}`}`)}
            className={status === value ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setStatus(value);
              syncUrl(value, search.trim());
            }}
          >
            {label}
          </a>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="wp-bulkbar">
          <span className="muted">{selected.length} dipilih</span>
          <button className="wp-btn" onClick={() => void bulkApply('publish')}>
            <Icon name="check" size={14} /> Publish
          </button>
          <button className="wp-btn" onClick={() => void bulkApply('draft')}>
            <Icon name="edit" size={14} /> Draft
          </button>
          <button className="wp-btn" onClick={() => void bulkApply('trash')}>
            <Icon name="trash" size={14} /> Sampah
          </button>
          <button className="wp-btn danger" onClick={() => void bulkApply('delete')}>
            <Icon name="trash" size={14} /> Hapus
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="wp-empty">
          Belum ada {type === 'page' ? 'halaman' : 'artikel'}. <a href={adminUrl(`${basePath}/new`)}>Buat sekarang</a>.
        </div>
      ) : (
        <table className="wp-list">
          <thead>
            <tr>
              <td style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? posts.map((p) => p.id) : [])}
                  aria-label="Pilih semua"
                />
              </td>
              <th>Judul</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Diperbarui</th>
              <th style={{ width: 230 }} />
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className={selected.includes(post.id) ? 'wp-row-selected' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(post.id)}
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id),
                      )
                    }
                    aria-label={`Pilih ${post.title}`}
                  />
                </td>
                <td>
                  <strong>
                    <a href={adminUrl(`${basePath}/${post.id}`)}>{post.title || '(tanpa judul)'}</a>
                  </strong>
                  <div className="row-actions-inline">
                    <a href={adminUrl(`${basePath}/${post.id}`)}>
                      <Icon name="edit" size={13} /> Edit
                    </a>
                    <button className="linklike" onClick={() => setQuickEditId(quickEditId === post.id ? null : post.id)}>
                      <Icon name="list" size={13} /> Edit Cepat
                    </button>
                    <button className="linklike" onClick={() => void api.patch(`/api/posts/${post.id}`).then(load)}>
                      <Icon name="trash" size={13} /> Sampah
                    </button>
                    <button className="linklike danger" onClick={() => void remove(post.id)}>
                      <Icon name="trash" size={13} /> Hapus
                    </button>
                  </div>
                  {quickEditId === post.id && (
                    <QuickEdit post={post} basePath={basePath} onClose={() => setQuickEditId(null)} onSaved={load} />
                  )}
                </td>
                <td className="mono">/{post.slug}</td>
                <td>
                  <span className={`wp-badge ${post.status}`}>{post.status}</span>
                </td>
                <td className="muted">{new Date(post.updatedAt).toLocaleString('id-ID')}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="muted mono">{post.id.slice(0, 8)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 10 }}>
        {total} item
        {selected.length > 0 ? ` · ${selected.length} dipilih` : ''}
      </p>
    </>
  );
}

function QuickEdit({
  post,
  basePath,
  onClose,
  onSaved,
}: {
  post: Post;
  basePath: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [status, setStatus] = useState(post.status === 'publish' ? 'publish' : 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/posts/${post.id}/quick`, { title, slug, status });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wp-quickedit">
      {error && <div className="wp-notice error">{error}</div>}
      <div className="wp-form-row">
        <label htmlFor={`qe-title-${post.id}`}>Judul</label>
        <input
          id={`qe-title-${post.id}`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>
      <div className="wp-form-row">
        <label htmlFor={`qe-slug-${post.id}`}>Slug</label>
        <input
          id={`qe-slug-${post.id}`}
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>
      <div className="wp-form-row" style={{ maxWidth: 180 }}>
        <label htmlFor={`qe-status-${post.id}`}>Status</label>
        <select id={`qe-status-${post.id}`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">Draft</option>
          <option value="publish">Published</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="wp-btn primary" disabled={busy} onClick={() => void save()}>
          Perbarui
        </button>
        <button className="wp-btn" onClick={onClose}>
          Batal
        </button>
        <a className="wp-btn" href={adminUrl(`${basePath}/${post.id}`)}>
          Edit Lengkap
        </a>
      </div>
    </div>
  );
}
