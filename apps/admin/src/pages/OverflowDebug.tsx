import { useState } from 'react';

/**
 * Halaman diagnostik layout: mencari elemen yang benar-benar menyebabkan
 * halaman bisa digeser horizontal.
 *
 * Catatan penting: elemen yang berada di luar layar ke KIRI (mis. drawer
 * yang tertutup dengan translateX(-100%)) tidak menyebabkan scroll dan
 * sengaja diabaikan. Yang dicari hanya elemen yang melewati tepi KANAN,
 * dan elemen yang bukan bagian dari position:fixed (fixed tidak
 * Transitional_layout contribute to overflow dokumen).
 */
export function OverflowDebugPage() {
  const [rows, setRows] = useState<string[] | null>(null);
  const [note, setNote] = useState('');

  function hasFixedAncestor(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node && node !== document.body) {
      if (getComputedStyle(node).position === 'fixed') return true;
      node = node.parentElement;
    }
    return false;
  }

  function scan() {
    const docWidth = document.documentElement.clientWidth;
    const all = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
    const overflowRight = new Set<HTMLElement>();

    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (hasFixedAncestor(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right > docWidth + 0.5) overflowRight.add(el);
    }

    // Akar penyebab: elemen yang melebar tapi induknya tidak melebar.
    const roots = Array.from(overflowRight).filter((el) => {
      const parent = el.parentElement;
      if (!parent) return true;
      return !overflowRight.has(parent);
    });

    const describe = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      return (
        `${el.tagName.toLowerCase()}${cls}\n` +
        `  posisi: ${getComputedStyle(el).position} | lebar: ${Math.round(r.width)}px | ` +
        `kanan: ${Math.round(r.right)}px | layar: ${docWidth}px | melebihi: ${Math.round(r.right - docWidth)}px`
      );
    };

    setNote(
      `Layar: ${docWidth}px | total elemen melewati tepi kanan: ${overflowRight.size} | akar penyebab: ${roots.length}`,
    );
    setRows(roots.length ? roots.slice(0, 12).map(describe) : ['Tidak ada elemen yang melewati tepi kanan.']);
  }

  async function copy() {
    if (!rows) return;
    const text = `LAYAR ${typeof window !== 'undefined' ? document.documentElement.clientWidth : 0}px\n${note}\n\n${rows.join('\n\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setNote('Tersalin ke clipboard - tempel di chat.');
    } catch {
      setNote('Gagal menyalin. Select manual ya.');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Cari penyebab geser horizontal</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Hanya mencari elemen yang melewati tepi <strong>kanan</strong>. Elemen di luar layar ke kiri (drawer tertutup)
        dan elemen di dalam <code>position: fixed</code> diabaikan karena keduanya tidak membuat halaman bisa
        digeser.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="wp-btn primary" onClick={scan}>
          Pindai sekarang
        </button>
        {rows && (
          <button className="wp-btn" onClick={() => void copy()}>
            Salin laporan
          </button>
        )}
      </div>

      {note && <p style={{ marginTop: 14, fontWeight: 600 }}>{note}</p>}

      {rows?.map((row, i) => (
        <pre
          key={i}
          style={{
            background: row.startsWith('Tidak ada') ? '#e7f6ec' : '#f6f7f7',
            padding: 10,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid #dcdcde',
          }}
        >
          {row}
        </pre>
      ))}

      <p className="muted" style={{ marginTop: 20 }}>
        <a href="/">Kembali ke Dasbor</a>
      </p>
    </div>
  );
}
