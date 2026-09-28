import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Term } from '@verbakit/core';

export interface TermOption extends Term {
  count?: number;
}

export interface TermSelection {
  /** Berisi id term yang sudah ada dan/atau nama baru. */
  categories: string[];
  tags: string[];
}

/**
 * Panel taksonomi ala WordPress: daftar kategori & tag dengan checkbox,
 * plus kolom tambah baru. Nilai yang dikembalikan bisa id term yang sudah
 * ada maupun nama baru — backend menerima keduanya.
 */
export function TaxonomyPanel({
  value,
  onChange,
}: {
  value: TermSelection;
  onChange: (next: TermSelection) => void;
}) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [draftCategory, setDraftCategory] = useState('');
  const [draftTags, setDraftTags] = useState('');

  useEffect(() => {
    api
      .get<{ terms: TermOption[] }>('/api/terms')
      .then((data) => setTerms(data.terms))
      .catch(() => undefined);
  }, []);

  const toggle = (kind: 'category' | 'tag', term: Term) => {
    const key = kind === 'category' ? 'categories' : 'tags';
    const current = value[key];
    const next = current.includes(term.id)
      ? current.filter((v) => v !== term.id)
      : [...current, term.id];
    onChange({ ...value, [key]: next });
  };

  const addDraft = (kind: 'category' | 'tag') => {
    const key = kind === 'category' ? 'categories' : 'tags';
    const raw = kind === 'category' ? draftCategory : draftTags;
    const names = raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && !value[key].includes(v));
    if (names.length === 0) return;
    onChange({ ...value, [key]: [...value[key], ...names] });
    if (kind === 'category') setDraftCategory('');
    else setDraftTags('');
  };

  const renderList = (kind: 'category' | 'tag') => {
    const key = kind === 'category' ? 'categories' : 'tags';
    const known = terms.filter((t) => t.kind === kind);
    const knownIds = new Set(known.map((t) => t.id));
    const pending = value[key].filter((v) => !knownIds.has(v));

    return (
      <>
        <div className="tax-list">
          {known.length === 0 && pending.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>Belum ada {kind === 'category' ? 'kategori' : 'tag'}.</p>
          )}
          {known.map((term) => (
            <label className="tax-item" key={term.id}>
              <input
                type="checkbox"
                checked={value[key].includes(term.id)}
                onChange={() => toggle(kind, term)}
              />
              <span>{term.name}</span>
              {term.count !== undefined && <span className="muted">({term.count})</span>}
            </label>
          ))}
          {pending.map((name) => (
            <label className="tax-item" key={`new-${name}`}>
              <input
                type="checkbox"
                checked
                onChange={() =>
                  onChange({ ...value, [key]: value[key].filter((v) => v !== name) })
                }
              />
              <span>
                {name} <em className="muted">(baru)</em>
              </span>
            </label>
          ))}
        </div>
        <div className="wp-form-row" style={{ marginTop: 8, marginBottom: kind === 'category' ? 12 : 0 }}>
          <input
            type="text"
            placeholder={kind === 'category' ? '+ kategori baru' : '+ tag baru (pisahkan dengan koma)'}
            value={kind === 'category' ? draftCategory : draftTags}
            onChange={(e) => (kind === 'category' ? setDraftCategory(e.target.value) : setDraftTags(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDraft(kind);
              }
            }}
            onBlur={() => addDraft(kind)}
          />
        </div>
      </>
    );
  };

  return (
    <div className="wp-publishbox" style={{ marginTop: 16 }}>
      <div className="pb-head">
        <span>Kategori &amp; Tag</span>
        <span className="muted">
          {value.categories.length + value.tags.length} dipilih
        </span>
      </div>
      <div className="pb-body">
        <div className="pb-row">
          <span className="label">Kategori</span>
        </div>
        {renderList('category')}
        <div className="pb-row">
          <span className="label">Tag</span>
        </div>
        {renderList('tag')}
      </div>
    </div>
  );
}
