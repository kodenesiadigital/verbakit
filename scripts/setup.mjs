/**
 * Pemasangan Verbakit untuk klien: satu perintah.
 *
 * Menggantikan 9 langkah manual yang rawan gagal:
 *   1. cek login wrangler
 *   2. buat / temukan resource D1, KV, R2
 *   3. tulis ID-nya ke wrangler.toml
 *   4. pasang secret acak (SESSION_SECRET, CRON_SECRET)
 *   5. build admin + Worker
 *   6. deploy
 *   7. pasang password admin
 *   8. tampilkan URL & kredensial
 *
 * Aman dijalankan berulang: resource yang sudah ada dipakai kembali.
 *
 * Pemakaian: npm run setup
 */
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const API = join(root, 'apps', 'api');
const TOML = join(API, 'wrangler.toml');
const WRANGLER = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const NAMA = {
  d1: 'verbakit-db',
  kv: 'verbakit',
  r2: 'verbakit-media',
  worker: 'verbakit-api',
};

const l = console.log;
const err = console.error;
const langkah = (n, total, teks) => l(`\n[${n}/${total}] ${teks}`);
const ok = (teks) => l(`      ✓ ${teks}`);
const info = (teks) => l(`      · ${teks}`);

function jalankan(args, { cwd = API, input } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [WRANGLER, ...args], {
      cwd,
      stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolveRun({ code, out }));
    if (input !== undefined) {
      child.stdin.write(input + '\n');
      child.stdin.end();
    }
  });
}

const TOTAL = 6;

// ---------------------------------------------------------------- 1. wrangler
langkah(1, TOTAL, 'Memeriksa wrangler & login Cloudflare');
if (!existsSync(WRANGLER)) {
  err('      wrangler belum terpasang. Jalankan: npm install');
  process.exit(1);
}
const whoami = await jalankan(['whoami']);
if (whoami.code !== 0 || /not logged in|Connect to Cloudflare/i.test(whoami.out)) {
  err('      Belum login ke Cloudflare.');
  info('Jalankan: npx wrangler login');
  process.exit(1);
}
const email = (whoami.out.match(/[\w.+-]+@[\w.-]+\.\w+/) ?? [])[0] ?? '(akun tidak terbaca)';
ok(`login sebagai ${email}`);

// ------------------------------------------------- 2. resource yang sudah ada
langkah(2, TOTAL, 'Mencari resource yang sudah ada');
const d1List = (await jalankan(['d1', 'list'])).out;
const kvList = (await jalankan(['kv', 'namespace', 'list'])).out;
const r2List = (await jalankan(['r2', 'bucket', 'list'])).out;

const ambilD1 = (teks) => {
  const m = teks.match(/│\s*([0-9a-f-]{36})\s*│\s*verbakit-db\s*│/);
  return m?.[1] ?? null;
};
const ambilR2 = (teks) => (teks.includes(NAMA.r2) ? NAMA.r2 : null);

/**
 * Cari KV berdasarkan judul lewat daftar, bukan dengan mengurai output
 * "kv namespace create".
 *
 * Output create memuat kode warna ANSI dan formatnya bisa berubah antar
 * versi wrangler, sehingga regex di sana rapuh. "kv namespace list"
 * mengeluarkan JSON yang stabil, jadi itu yang dipakai.
 */
/**
 * Daftar namespace KV di akun. Output "kv namespace list" berupa JSON; kalau
 * sampai tidak bisa diurai, kembalikan daftar kosong agar langkah berikutnya
 * tetap berjalan (namespace lalu dibuat ulang).
 */
async function daftarKv() {
  const keluaran = (await jalankan(['kv', 'namespace', 'list'])).out;
  try {
    const data = JSON.parse(keluaran.replace(/^\uFEFF/, ''));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const idKvDariDaftar = async () => (await daftarKv()).find((n) => n?.title === NAMA.kv)?.id ?? null;
const idKvDiToml = () => {
  const m = readFileSync(TOML, 'utf8').match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([0-9a-f]{32})"/);
  return m?.[1] ?? null;
};

const ada = {
  d1: ambilD1(d1List),
  r2: ambilR2(r2List),
  kv: null,
};
{
  // Pakai ID yang sudah tertulis di wrangler.toml asal namespace-nya
  // benar-benar masih ada di akun; kalau tidak, akan dibuat baru.
  const daftar = await daftarKv();
  const semuaId = daftar.map((n) => n.id);
  const diToml = idKvDiToml();
  ada.kv = diToml && semuaId.includes(diToml) ? diToml : (daftar.find((n) => n.title === NAMA.kv)?.id ?? null);
}
for (const [k, v] of Object.entries(ada)) info(`${k}: ${v ? 'ada, dipakai' : 'belum ada'}`);

// ------------------------------------------------------------- 3. buat resource
langkah(3, TOTAL, 'Membuat resource yang belum ada');
const d1Id = ada.d1 ?? (await jalankan(['d1', 'create', NAMA.d1])).out.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? null;
if (d1Id) ok(`D1 ${d1Id.slice(0, 8)}…`);

// KV: buat, lalu ambil ID dari daftar resmi (bukan dari output create).
let kvId = ada.kv;
if (!kvId) {
  const buat = await jalankan(['kv', 'namespace', 'create', NAMA.kv]);
  if (buat.code !== 0) {
    // Namespace dengan judul sama mungkin sudah ada dari percobaan sebelumnya.
    kvId = await idKvDariDaftar();
    if (!kvId) {
      err('      Gagal membuat namespace KV. Output wrangler:');
      for (const baris of buat.out.split('\n').filter((l) => l.trim()).slice(-6)) err('        ' + baris);
      process.exit(1);
    }
    ok(`KV sudah ada dari percobaan sebelumnya: ${kvId.slice(0, 8)}…`);
  } else {
    kvId = await idKvDariDaftar();
    if (kvId) ok(`KV ${kvId.slice(0, 8)}…`);
  }
}

// R2 bersifat opsional. Media adalah fitur tambahan; Kern CMS harus tetap bisa
// jalan tanpa R2, jadi instalasi tidak dihentikan di sini.
//
// R2 tidak bisa diaktifkan lewat API: Cloudflare meminta metode pembayaran
// lewat dashboard. Kalau dilewati, binding MEDIA sengaja tidak ditulis dan
// endpoint media menjawab dengan pesan yang bisa ditindaklanjuti.
let r2 = ada.r2;
if (!r2) {
  const buat = await jalankan(['r2', 'bucket', 'create', NAMA.r2]);
  const teks = buat.out.replace(/\u001b\[[0-9;]*m/g, '');
  if (buat.code === 0) {
    r2 = NAMA.r2;
    ok(`R2 ${NAMA.r2}`);
  } else if (/enable R2|10042/i.test(teks)) {
    info('R2 belum diaktifkan di akun ini - installation tetap dilanjutkan.');
    info('  Nanti: dashboard Cloudflare -> "R2 Object Storage" -> Enable.');
    info('  Sementara itu, unggah gambar akan menjawab "belum tersedia".');
  } else {
    info(`R2 gagal dibuat: ${teks.split('\n').filter((l) => l.trim()).slice(-1)}`);
    info('  Instalasi dilanjutkan tanpa media; perbaiki R2 lalu jalankan ulang.');
  }
} else ok(`R2 ${NAMA.r2} (pakai yang ada)`);

// ------------------------------------------------------- 4. tulis wrangler.toml
langkah(4, TOTAL, 'Menulis wrangler.toml');
if (!d1Id || !kvId) {
  err('      Resource inti belum lengkap sehingga konfigurasi tidak ditulis.');
  err(`      D1: ${d1Id ? 'ok' : 'gagal'}  |  KV: ${kvId ? 'ok' : 'gagal'}`);
  err('      Jalankan ulang: npm run setup');
  process.exit(1);
}
let toml = readFileSync(TOML, 'utf8');
toml = toml
  .replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${d1Id}"`)
  .replace(/(\[\[kv_namespaces\]\]\s*\n\s*binding\s*=\s*"KV"\s*\n\s*id\s*=\s*)"[^"]*"/, `$1"${kvId}"`);

if (r2) {
  toml = toml.replace(/(bucket_name\s*=\s*)"[^"]*"/, `$1"${r2}"`);
} else {
  // Tanpa R2, blok binding-nya dihapus agar deploy tetap berhasil dan
  // endpoint media bisa menjawab dengan pesan yang jelas.
  toml = toml.replace(/\n\[\[r2_buckets\]\][\s\S]*?\n\n?/, '\n\n');
}

writeFileSync(TOML, toml, 'utf8');
ok(`D1 dan KV terisi${r2 ? `, R2 ${r2}` : ' (R2 dilewati)'}`);

// ---------------------------------------------------------------- 5. secret
langkah(5, TOTAL, 'Memasang secret acak');

// Password admin HARUS ditampilkan. Pada instalasi baru, akun admin
// di-seed memakai nilai secret ADMIN_PASSWORD; kalau tidak dicetak, pemilik
// instalasi tidak akan pernah bisa masuk.
const adminPassword = crypto.randomBytes(12).toString('base64url');

const pasang = async (nama, nilai) => {
  await new Promise((selesai) => {
    const child = spawn(process.execPath, [WRANGLER, 'secret', 'put', nama], { cwd: API, stdio: ['pipe', 'pipe', 'pipe'] });
    let o = '';
    child.stdout.on('data', (d) => (o += d));
    child.stderr.on('data', (d) => (o += d));
    child.on('close', () => {
      ok(/success|uploaded/i.test(o) ? nama : `${nama} (gagal)`);
      selesai();
    });
    child.stdin.write(nilai + '\n');
    child.stdin.end();
  });
};
await pasang('SESSION_SECRET', crypto.randomBytes(32).toString('base64url'));
await pasang('CRON_SECRET', crypto.randomBytes(24).toString('base64url'));
await pasang('ADMIN_PASSWORD', adminPassword);
ok('ADMIN_PASSWORD dibuat acak (ditampilkan di ringkasan)');

// ---------------------------------------------------------------- 6. deploy
langkah(6, TOTAL, 'Build & deploy');
const build = await spawnSyncish();
function spawnSyncish() {
  return new Promise((r) => {
    const c = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    c.on('close', (code) => r(code));
  });
}
const kodeBuild = await build;
if (kodeBuild !== 0) {
  err('      Build gagal.');
  process.exit(1);
}
ok('build selesai');

const deploy = await jalankan(['deploy']);
if (deploy.code !== 0) {
  err('      Deploy gagal. Jalankan: npx wrangler deploy');
  process.exit(1);
}
const versi = deploy.out.match(/Current Version ID:\s*(\S+)/)?.[1];
ok(`deploy Worker ${versi ? '(' + versi.slice(0, 8) + '…)' : ''}`);

// ------------------------------------------------------------------ penutup
// Subdomain workers.dev tidak bisa ditebak: "whoami" tidak mencetaknya, dan
// domain email sama sekali tidak terkait. Output deploy yang jadi sumbernya.
const url = deploy.out.match(/https:\/\/[^\s|]+\.workers\.dev/)?.[0] ?? null;

l('\n' + '─'.repeat(64));
l('  Verbakit terpasang');
l('─'.repeat(64));
l(`  Situs        : ${url}`);
l(`  Dasbor admin : ${url}/admin`);
l(`  Worker       : ${NAMA.worker}`);
l(`  D1           : ${NAMA.d1} (${d1Id.slice(0, 8)}…)`);
l(`  R2           : ${NAMA.r2}`);
l(`  KV           : ${NAMA.kv} (${kvId.slice(0, 8)}…)`);
l('');
l('  Login admin  : admin');
l(`  Password     : ${adminPassword}`);
l('');
l('  Simpan password ini sekarang. Untuk ganti: npm run set-admin-password');
l('  (Password hanya ditampilkan sekali, saat instalasi.)');
l('');
l('  Deploy ulang : git push  (CI otomatis) atau  npm run deploy');
l('─'.repeat(64) + '\n');
