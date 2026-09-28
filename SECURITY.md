# Keamanan

## Melaporkan kerentanan

**Jangan** membuka issue publik untuk melaporkan kerentanan.

Laporkan lewat GitHub Security Advisories pada repo ini
(menu **Security → Report a vulnerability**), atau kirim surel ke
`security@verbakit.my.id`.

Sertakan:

- Langkah reproduksi
- Dampak yang diharapkan
- Versi Verbakit (nomor commit atau isi `package.json`) dan konfigurasi
- Bukti bila ada (screenshot, log, atau request mentah)

## Target waktubalas

- Konfirmasi diterima: 3 hari kerja
- Penilaian awal: 7 sampai 14 hari kerja
- Perbaikan dan rilis: bergantung pada tingkat keparahan

## Cakupan yang relevan

| Area | Contoh |
|---|---|
| Autentikasi dan sesi | Token tidak bisa dipalsukan, password bocor, cookie lemah |
| Otorisasi | Peran non-admin bisa mengakses halaman admin |
| Plugin service | Verifikasi tanda tangan, kebocoran data yang dikirim |
| Unggahan media | File berbahaya, path traversal |
| Rate limit | Bypass sehingga brute force mungkin |

## Di luar cakupan

- Serangan pada akun Cloudflare pelanggan
- Plugin yang sengaja ditulis berbahaya. Plugin bundled berjalan dengan hak
  penuh, persis seperti PHP di WordPress
- Instalasi yang memakai `SESSION_SECRET` lemah atau melakukan commit secret ke repo

## Praktik yang kami sarankan

```bash
npx wrangler secret put SESSION_SECRET   # nilai acak panjang, jangan di commit
npx wrangler secret put CRON_SECRET
```

Developer yang melakukan self-hosting bertanggung jawab menjaga secret masing-masing.
