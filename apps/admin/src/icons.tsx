/**
 * Ikon garis (stroke) bergaya dashicons WordPress, digambar inline agar tidak
 * butuh asset eksternal. `name` menentukan ikon yang dipakai.
 *
 * Glyph = outline path (stroke) + opsional `dots` ( lingkaran filled ) supaya
 * titik-titik kecil tetap tajam dan tidak berubah jadi gumpalan saat stroke tebal.
 */
interface Glyph {
  outline: string;
  dots?: readonly (readonly [x: number, y: number, r: number])[];
}

const GLYPHS: Record<string, Glyph> = {
  dashboard: {
    outline: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v5h-7zM13.5 11.5h7v9h-7zM3.5 13.5h7v7h-7z',
  },
  post: { outline: 'M5 3.5h14v17H5zM8.5 8h7M8.5 12h7M8.5 16h4' },
  page: { outline: 'M6 3.5h8l5 5v12H6zM14 3.5v5h5M9 13h6M9 16.5h6' },
  media: {
    outline: 'M3.5 5h17v14h-17zM3.5 15.5 8 11l3.5 3.5L15 11l5.5 5.5',
    dots: [[8.4, 9.4, 1.5]],
  },
  list: {
    outline: 'M9 6h11M9 12h11M9 18h11',
    dots: [[4.6, 6, 1.1], [4.6, 12, 1.1], [4.6, 18, 1.1]],
  },
  plus: { outline: 'M12 5v14M5 12h14' },
  check: { outline: 'M4.5 12.5 9.5 17.5 19.5 6.5' },
  undo: { outline: 'M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14H8' },
  plugin: { outline: 'M9 3v4M15 3v4M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0zM12 16v5' },
  users: {
    outline:
      'M15.5 20v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.1a3.6 3.6 0 0 0-3.6 3.6V20M9 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2M21 20v-1.8a3.6 3.6 0 0 0-2.7-3.5M15.5 4.1a3.6 3.6 0 0 1 0 7',
  },
  // Palet: bulatan dengan lubang jempol + titik cat (ikon Tampilan ala WordPress).
  appearance: {
    outline:
      'M12 3.6c-4.7 0-8.5 3.7-8.5 8.1 0 4.4 3.6 7.9 8.1 7.9.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.6c2.3 0 4.2-1.9 4.2-4.1 0-3.6-3.6-6.5-7.8-6.5z',
    dots: [[7.4, 13.4, 1.2], [9.6, 8.6, 1.2], [14.2, 7.6, 1.2]],
  },
  settings: {
    outline:
      'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2',
  },
  home: { outline: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10' },
  blog: { outline: 'M4.5 4.5h15v15h-15zM8 8.5h8M8 12h8M8 15.5h5' },
  comment: { outline: 'M20.5 12a8 8 0 0 1-8 8H4l2.6-3A8 8 0 1 1 20.5 12z' },
  chart: { outline: 'M4 20V11M10 20V4M16 20v-6M22 20H2' },
  update: { outline: 'M20.5 12a8.5 8.5 0 1 1-2.9-6.4M20.5 3.5v5h-5' },
  trash: { outline: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7M10.5 10.5v6M13.5 10.5v6' },
  edit: { outline: 'M4 20h4L20 8l-4-4L4 16zM14.5 5.5 18.5 9.5' },
  search: { outline: 'M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15M20.5 20.5 16 16' },
  chevron: { outline: 'M9.5 6l6 6-6 6' },
  close: { outline: 'M6 6l12 12M18 6 6 18' },
  star: { outline: 'M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9z' },
  screen: { outline: 'M3.5 4.5h17v11h-17zM8.5 20h7M12 15.5V20' },
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const glyph = GLYPHS[name] ?? GLYPHS['page']!;
  return (
    <svg
      className="wp-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={glyph.outline} />
      {glyph.dots?.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
