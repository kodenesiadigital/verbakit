# Kontribusi ke PressForge

Terima kasih sudah bersedia membantu. Dokumen ini menjelaskan cara menjalankan
PressForge di mesin Anda dan apa yang diharapkan dari pull request.

## Menjalankan secara lokal

Prasyarat: Node.js 20+, npm 10+, dan akun Cloudflare (gratis cukup).

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run dev:api      # http://127.0.0.1:8787
npm run dev:admin    # http://127.0.0.1:5173/admin
```

`npm run dev:api` memakai D1, KV, dan R2 lokal sehingga tidak menyentuh akun
Cloudflare Anda.

## Sebelum mengirim pull request

```bash
npm run typecheck     # wajib bersih di semua workspace
npm run build         # typecheck + registry plugin + build admin
```

PR yang build-nya gagal atau punya error typecheck tidak akan direview.

## Gaya kode

- TypeScript strict, ESM, tanpa default export pada modul util
- Ikuti pola yang sudah ada di file sekitar; konsistensi lebih penting daripada
  preferensi pribadi
- Jangan menambah dependensi produksi tanpa alasan yang jelas
- Semua teks antarmuka berbahasa Indonesia; komentar kode boleh bahasa Inggris

## Commit message

Gaya Conventional Commits:

```
feat: menambah panel taksonomi di editor
fix: memperbaiki spesifisitas CSS drawer menu
docs: menjelaskan model distribusi plugin
refactor: memisahkan klien plugin service
chore: memperbarui .gitignore
```

## Menambah plugin first-party

Plugin diletakkan di `plugins/<nama>/` dengan `manifest.json` dan entry
TypeScript. Setelah menambah atau mengubah plugin, jalankan:

```bash
npm run build:registry
```

Jangan mengedit `apps/api/src/plugins/registry.ts` secara manual; file itu
dihasilkan otomatis oleh `scripts/generate-registry.mjs`.

## Menambah dependensi

- `packages/core` dan `packages/plugin-sdk` harus tetap tanpa dependensi runtime,
  karena keduanya dipakai plugin author di luar repo ini
- Untuk kode admin (React), hindari dependensi produksi kalau bisa

## Yang perlu dibahas sebelum diterima

- Perubahan skema D1 harus menaikkan `SCHEMA_VERSION` di `apps/api/src/schema.ts`
  dan tetap idempotent (`CREATE TABLE IF NOT EXISTS`)
- Perubahan pada kontrak hook plugin adalah breaking change; catat di `docs/adr/`
  dan diumumkan ke pengguna
- Perubahan yang menyentuh autentikasi, sesi, atau rate limit perlu dua reviewer
