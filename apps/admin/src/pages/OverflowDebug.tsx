import { useState } from 'react';

/**
 * Halaman diagnostik (khusus dev): mencari elemen yang lebih lebar daripada
 * layar, sehingga tahu persis apa yang menyebabkan halaman bisa digeser
 * horizontal.
 */
export function OverflowDebugPage() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);

  function scan() {
    const docWidth = document.documentElement.clientWidth;
    const found: ReportRow[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right <= docWidth + 0.5 && rect.left >= -0.5) continue;

      found.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
        position: style.position,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      });
    }

    found.sort((a, b) => b.right - a.right);
    setRows(found.slice(0, 25));
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Cari elemen melebar</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Lebar layar: <strong>{typeof window !== 'undefined' ? document.documentElement.clientWidth : 0}px</strong>
      </p>
      <button className="wp-btn primary" onClick={scan}>
        Pindai sekarang
      </button>

      {rows && (
        <>
          <p style={{ marginTop: 14 }}>
            {rows.length === 0 ? (
              <strong style={{ color: '#0a7c2f' }}>Tidak ada elemen yang melebar.</strong>
            ) : (
              <>
                <strong style={{ color: '#d63638' }}>{rows.length} elemen melebar:</strong>
              </>
            )}
          </p>
          {rows.map((r, i) => (
            <pre
              key={`${r.tag}-${r.cls}-${i}`}
              style={{
                background: '#f6f7f7',
                padding: 10,
                fontSize: 12,
                overflowX: 'auto',
                border: '1px solid #dcdcde',
              }}
            >
              {`${r.tag}${r.cls ? '.' + r.cls.split(' ').join('.') : ''}
  position : ${r.position}
  kiri     : ${r.left}px
  kanan    : ${r.right}px
  lebar    : ${r.width}px`}
            </pre>
          ))}
        </>
      )}

      <p className="muted" style={{ marginTop: 20 }}>
        <a href="/">Kembali ke Dasbor</a>
      </p>
    </div>
  );
}

interface ReportRow {
  tag: string;
  cls: string;
  position: string;
  left: number;
  right: number;
  width: number;
}
