import { useState } from 'react';
import { Icon } from '../icons.tsx';

const NAMES = [
  'dashboard', 'post', 'page', 'media', 'list', 'plus', 'plugin', 'users',
  'appearance', 'settings', 'home', 'blog', 'comment', 'chart', 'update',
  'trash', 'edit', 'search', 'chevron', 'star', 'screen',
];

export function IconGalleryPage() {
  const [size, setSize] = useState(40);
  return (
    <div className="wp-card">
      <h2>Galeri Ikon (dev)</h2>
      <div className="wp-card-body">
        <label>
          Ukuran {size}px
          <input
            type="range"
            min={16}
            max={72}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 14, marginTop: 14 }}>
          {NAMES.map((name) => (
            <div key={name} style={{ textAlign: 'center', border: '1px solid #dcdcde', padding: 10, borderRadius: 4 }}>
              <div style={{ color: '#1d2327' }}>
                <Icon name={name} size={size} />
              </div>
              <div className="mono muted" style={{ marginTop: 6 }}>{name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}