# ADR 0001: Model Distribusi Plugin

Status: **Proposed** · Tanggal: 2026-09-26

## Konteks

Verbakit boucles WordPress-like: plugin adalah ekstensi yang bisa ditulis developer
lain. Saat ini plugin hanya bisa dimuat saat build lewat `scripts/generate-registry.mjs`.
Artinya pembeli CMS tidak bisa menambah plugin setelah instalasi — ini masalah
fundamental untuk model bisnis "jual CMS + marketplace plugin".

## Bukti: batasan runtime Cloudflare Workers

Diuji langsung di `workerd` (wrangler dev), bukan mengandalkan dokumentasi:

| Mekanisme | Hasil |
|---|---|
| `eval()` | DITOLAK — "Code generation from strings disallowed for this context" |
| `new Function()` | DITOLAK — pesan sama |
| `import('https://…')` | DITOLAK — "No such module" |
| `import('data:text/javascript,…')` dengan specifier **literal** | BERJALAN |
| `import('data:text/javascript,…')` dengan specifier **variabel/fungsi** | DITOLAK — "No such module" |
| `WebAssembly.instantiate()` | DITOLAK di dev — "Wasm code generation disallowed by embedder" |
| Subrequest HTTP keluar (`fetch` ke origin lain) | BERJALAN |

**Artinya:** specifier `data:` yang berhasil itu di-inline oleh bundler saat build,
persis setara import statis. Code generation runtime tidak dimungkinkan oleh isolate.

Kesimpulan: **Worker tidak dapat mengeksekusi kode pihak ketiga saat runtime.**

## Opsi

### A. Bundled saja (status quo)
Plugin di-compile ke dalam Worker saat build. Cepat (in-process), akses penuh ke API.
**Kekurangan:** setiap plugin baru butuh deploy ulang. Tidak ada marketplace self-serve.

### B. Service plugin (HTTP)
Plugin adalah layanan luar. Manifest mendaftarkan endpoint + kapabilitas; CMS memanggilnya
melalui `fetch` (berhasil, lihat tabel). Backend plugin bisa bahasa apa pun.
**Kelebihan:** install = tulis record di D1, tanpa deploy. Sesuai model marketplace.
**Kekurangan:** latensi jaringan per hook; plugin harus di-host; hook cepat (misal
mengubah satu field) terasa mahal; management secret & uptime Jadi urusan plugin.

### C. Hybrid (rekomendasi)
Dua sumber plugin, dipilih per plugin:

- **`bundled`** — (first-party) plugin yang sudah ter-compile. In-process, cepat, untuk
  fitur inti dan plugin yang butuh hook pada setiap request.
- **`service`** — plugin marketplace. Manifest di D1: `id`, `name`, `version`, `endpoint`,
  `capabilities`, `status`. Install = insert row + aktivasi, **tanpa deploy**.

Dispatch hook ke service plugin: `POST {endpoint}/hooks/{tag}` dengan payload ter-scope,
tanda tangan HMAC, timeout, dan circuit breaker. Halaman admin plugin lewat iframe ke
`{endpoint}/admin/{slug}` dengan token sesi berumur pendek.

### D. WASM plugin
Plugin dikompilasi ke WASM, dimuat lewat `wasm_modules` di wrangler config.
**Ditolak:** tetap butuh deploy, dan menulis filter konten dalam WASM mentah
tidak realistis dibanding SDK JS.

## Rekomendasi: Opsi C (Hybrid)

Alasannya:

1. Satu-satunya opsi yang memenuhi kebutuhan bisnis (install tanpa deploy) **dan** tetap
   mempertahankan plugin first-party yang cepat.
2. Boundary keamanannya jelas. Plugin `service` tidak pernah menyentuh `env` Worker —
   CMS yang menentukan data mana yang boleh dikirim (scope per kapabilitas). Plugin
   `bundled` dipercaya seperti WordPress mempercayai PHP miliknya sendiri.
3. Tidak mengorbankan bahasa: plugin service bisa Rust, Go, Python, atau Workers juga.

## Konsekuensi

- Schema D1 baru: tabel `plugins` (registry runtime) terpisah dari registry build-time.
- `PluginManager` dipecah: `BundledRegistry` (dari generated registry) + `ServiceRegistry`
  (dari D1), dengan antarmuka hook yang sama.
- Kontrak hook untuk plugin service harus didokumentasikan & versioned (bisa berubah
  → plugin service bisa rusak saat CMS naik versi).
- Marketplace UI: browse, install, permission review, activate/deactivate, uninstall, update.
- Rate limit & circuit breaker per endpoint plugin agar plugin lambat/buru tidak
  menjatuhkan halaman.

## Yang belum diputuskan

- Auth plugin service: shared secret per instalasi, atau OAuth per kapabilitas?
- Skema kapabilitas apa yang wajib ada di v1.
- Apakah plugin service boleh dipanggil pada jalur render halaman, atau hanya cron/admin?
