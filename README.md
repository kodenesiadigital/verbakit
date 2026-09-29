# Verbakit

![Lisensi: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Runtime: Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange.svg)
![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178C6.svg)

CMS bergaya WordPress yang berjalan **sepenuhnya di Cloudflare Workers** — tanpa VPS,
tanpa PHP, tanpa MySQL. Konten di D1, media di R2, konfigurasi di KV, dasbor admin
 sebagai SPA.

Dirancang untuk developer yang mau menjual situs ke klien tanpa menyiapkan
infrastruktur, dan untuk developer yang mau membangun plugin sendiri.

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker  (verbakit)                      │
│                                                     │
│   /            → situs publik (render tema)         │
│   /admin/*     → dasbor admin (SPA)                 │
│   /api/*       → REST API                           │
│   /sitemap.xml → sitemap otomatis                   │
│   /robots.txt  → robots otomatis                    │
└─────────────────────────────────────────────────────┘
   │              │              │              │
   ▼              ▼              ▼              ▼
  D1 (D1)      R2 (media)     KV (config)   Subrequest
  konten        berkas         rate limit    → plugin service
```

## Fitur

**Konten**
- Post & halaman dengan **revisi** (otomatis tiap simpan, 25 versi terakhir, bisa dipulihkan)
- **Kategori & tag** dengan taksonomi penuh
- **Gambar utama** (featured image) lewat media picker
- Media library di R2, disajikan via `/api/media/<key>`
- **Revisi**, **quick edit** (edit inline di daftar), dan **bulk actions** ala WordPress

**Plugin — dua jenis**

| Jenis | Cara kerja | Kapan dipakai |
|---|---|---|
| **Bundled** | Dikompilasi ke dalam Worker, jalan in-process | Plugin first-party, hook yang jalan tiap request |
| **Service** | Layanan HTTP terpisah, di-*install* saat runtime | Plugin marketplace |

Plugin service dipasang dari URL manifest — **tanpa build ulang**. Menerima **event**
bukan filter (filter harus sinkron, HTTP tidak), dan hanya pada jalur admin & cron.
Render halaman publik tetap 100% plugin bundled supaya tidak ada latensi jaringan
di depan pengunjung.

> Batasan runtime Cloudflare prohibits eksekusi kode pihak ketiga di dalam Worker
> (tidak ada `eval`, `import()` dari URL, maupun WASM dinamis). Bukti & alasannya
> ada di [docs/adr/0001](docs/adr/0001-model-distribusi-plugin.md).

**Tema**
- 3 tema bawaan, bisa diganti dari dasbor
- Template dirender server-side, dengan hook `theme.index` & `content.render` untuk plugin

- **Admin**
- Layout ala WordPress: sidebar, admin bar, tabel, badge status
- Ikon SVG inline, submenu flyout, drawer untuk layar kecil
- Profil pengguna, ganti password, lupa/reset password (mailer Resend)

**Keamanan**
- Password PBKDF2-SHA256 (100k iterasi), session cookie HMAC-SHA256
- Cookie `Secure` hanya di HTTPS
- Rate limit login (5×/5 menit per IP) berbasis KV
- Proteksi Origin untuk mencegah CSRF
- Token reset password: acak 256-bit, hanya hash yang disimpan, berlaku 30 menit, sekali pakai

## Menjalankan secara lokal

Prasyarat: Node.js 20+ dan akun Cloudflare (gratis cukup).

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # isi SESSION_SECRET dll
npm run dev:api      # Worker di http://127.0.0.1:8787
npm run dev:admin    # Vite di  http://127.0.0.1:5173/admin
```

Buka `http://127.0.0.1:5173/admin`, masuk dengan `admin` / `admin123`.

## Deploy

### Pemasangan (satu perintah)

Prasyarat: Node.js 20+ dan akun Cloudflare (gratis). Klien memasang di akunnya
sendiri, jadi biaya infrastruktur tidak ada.

```bash
git clone https://github.com/kodenesiadigital/verbakit.git
cd verbakit
npm install
npx wrangler login      # otorisasi akun Cloudflare milik Anda
npm run setup
```

`npm run setup` menjalankan semuanya: cek login, buat resource D1/KV/R2 yang belum
ada, tulis ID-nya ke `wrangler.toml`, pasang secret acak, build, deploy, lalu
tampilkan URL dan kredensialnya. Aman dijalankan berulang — resource yang sudah
ada dipakai ulang.

Buat resource Cloudflare lebih dulu:

```bash
npx wrangler login
npx wrangler d1 create verbakit-db
npx wrangler kv namespace create KV
npx wrangler r2 bucket create verbakit-media
```

Masukkan ID yang didapat ke `apps/api/wrangler.toml`, lalu:

```bash
npm run deploy
```

Secret (jangan pernah ditaruh di repo):

```bash
npx wrangler secret put SESSION_SECRET    # wajib, panjang acak
npx wrangler secret put CRON_SECRET      # untuk /api/cron/tick
npx wrangler secret put RESEND_API_KEY   # opsional, tanpa ini email reset hanya ditulis ke log
```

### Deploy dari GitHub Actions

Agar setiap `git push` ke `main` langsung deploy, isi 5 secret di
**Settings → Secrets and variables → Actions**:

| Secret | Isi |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Account ID dari dashboard |
| `CLOUDFLARE_API_TOKEN` | Token dengan izin Workers Scripts, D1, KV, R2 (Edit) |
| `D1_DATABASE_ID` | UUID database D1 |
| `KV_NAMESPACE_ID` | Id namespace KV |
| `R2_BUCKET_NAME` | Nama bucket R2 |

Batas paket free Cloudflare yang perlu diketahui: 100.000 request/hari, CPU 10 ms per
request, dan 1.000 tulis KV/hari. Untuk trafik lebih besar, upgrade Workers Paid
($5/bulan).

## Menulis plugin

SDK-nya sudah terbit di npm:

```bash
npm install @kodenesiadigital/verbakit-plugin-sdk
# @kodenesiadigital/verbakit-core ikut terpasang sebagai dependensi
```

| Paket | Isi |
|---|---|
| [`@kodenesiadigital/verbakit-plugin-sdk`](https://www.npmjs.com/package/@kodenesiadigital/verbakit-plugin-sdk) | API yang dipakai plugin (`definePlugin`) |
| [`@kodenesiadigital/verbakit-core`](https://www.npmjs.com/package/@kodenesiadigital/verbakit-core) | Tipe, registry hook/filter, loader plugin |

Keduanya berlisensi AGPL-3.0-or-later, butuh Node 20+.

### Plugin bundled

```bash
mkdir -p plugins/jamku/src
```

`plugins/jamku/manifest.json`:

```json
{
  "id": "jamku",
  "name": "Jamku",
  "version": "1.0.0",
  "description": "Menampilkan jam di footer.",
  "entry": "src/index.ts",
  "requires": ">=0.1.0"
}
```

`plugins/jamku/src/index.ts`:

```ts
import { definePlugin } from '@kodenesiadigital/verbakit-plugin-sdk';
```

Plugin yang berdiri sendiri di repo lain memakai dependensi yang sama persis
(`npm install @kodenesiadigital/verbakit-plugin-sdk`), lalu dikompilasi ke dalam Worker-nya.

export default definePlugin((api) => {
  api.addFilter('content.render', (html) => `${html}<p>${new Date().toLocaleTimeString('id-ID')}</p>`);

  api.registerAdminPage({
    slug: 'status',
    title: 'Status Jamku',
    render: async () => '<p>Plugin aktif.</p>',
  });

  return { activate: () => api.log('jamku aktif') };
});
```

Lalu `npm run build:registry` dan deploy. Hook yang tersedia antara lain
`content.render`, `posts.list`, `posts.get`, `sitemap.urls`, `theme.index`,
`cms.dashboard.visit`.

### Plugin service

Plugin service adalah Worker terpisah yang menerima event:

```ts
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/manifest.json') {
      return Response.json({
        id: 'contoh',
        name: 'Contoh',
        version: '1.0.0',
        endpoint: 'https://contoh.example.workers.dev',
        capabilities: ['read:options', 'write:own_options'],
      });
    }

    if (url.pathname.startsWith('/hooks/')) {
      const body = await request.json();
      return Response.json({ ok: true, received: body });
    }

    return new Response('ok');
  },
};
```

Pasang dari **Dasbor → Plugin → Tambah Plugin** dengan URL manifest. Setiap request
ditandatangani HMAC-SHA256 pada `timestamp.body` — plugin wajib memverifikasi
header `x-verbakit-signature` sebelum memproses apa pun.

## Struktur repositori

```
apps/api         Worker: REST API, render publik, tema
apps/admin       Dasbor admin (React + Vite)
packages/core    Registry action/filter, plugin loader, tipe
packages/plugin-sdk  API yang dipakai penulis plugin
plugins/*         Plugin first-party (bundled saat build)
docs/adr         Catatan keputusan arsitektur
```

## Lisensi

AGPL-3.0. Boleh dipakai, diubah, dan dijalankan bebas — termasuk untuk keperluan
komersial. Jika Anda menjalankan versi modifikasi sebagai layanan untuk pengguna
lain, Anda **wajib** membuka source modifikasi tersebut (Bab 13).

## Berkontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Kerentanan keamanan dilaporkan lewat
[SECURITY.md](SECURITY.md), jangan dibuka sebagai issue publik.
