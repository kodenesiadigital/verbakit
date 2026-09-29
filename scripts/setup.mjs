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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/**
 * Perintah inspeksi & pembuatan resource dijalankan dari root repo, bukan
 * dari apps/api.
 *
 * Alasannya: bila wrangler.toml pernah rusak, semua perintah yang membacanya
 * akan gagal - termasuk whoami. Kalau pemeriksaan login Depends pada file itu,
 * installer berhenti di langkah 1 dan tidak pernah bisa memperbaiki file yang
 * salah. Dijalankan dari root, perintah ini tidak membaca wrangler.toml sama
 * sekali. Hanya "deploy" yang memang butuh konfigurasi.
 */
const jalankan = (args, { cwd = root, input } = {}) => {
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
};

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
// D1 dibuat sekarang? menentukan apakah akun admin dibuat oleh proses ini
// (dan perlu passwordnya disesuaikan).const d1Baru = !ada.d1;
const d1Id = ada.d1 ?? (await jalankan(['d1', 'create', NAMA.d1])).out.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? null;
if (d1Id) ok(`D1 ${d1Id.slice(0, 8)}…${d1Baru ? ' (baru)' : ''}`);

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

/**
 * wrangler.toml digenerate utuh, bukan disunting dengan regex.
 *
 * Menyunting file yang sama berulang kalidewasa.reddit ended up merusak
 * TOML: satu blok terbuang sebagian, menyisakan kunci yatim yang
 * membuat wrangler menolak memuat konfigurasi.
 */
function susunToml() {
  const bagian = [
    'name = "verbakit-api"',
    'main = "src/index.ts"',
    'compatibility_date = "2025-01-01"',
    'compatibility_flags = ["nodejs_compat"]',
    '',
    '# Aset statis (build admin) disajikan Worker di bawah /admin.',
    '[assets]',
    'directory = "../admin/dist"',
    'binding = "ASSETS"',
    'not_found_handling = "none"',
    'run_worker_first = true',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "verbakit-db"',
    `database_id = "${d1Id}"`,
    '',
  ];
  if (r2) {
    bagian.push('[[r2_buckets]]', 'binding = "MEDIA"', `bucket_name = "${r2}"`, '');
  }
  bagian.push('[[kv_namespaces]]', 'binding = "KV"', `id = "${kvId}"`, '');
  bagian.push('[vars]', 'ADMIN_EMAIL = "admin@verbakit.test"', '');
  return bagian.join('\n');
}

writeFileSync(TOML, susunToml(), 'utf8');
ok(`D1 dan KV terisi${r2 ? `, R2 ${r2}` : ' (R2 dilewati)'}`);

// ---------------------------------------------------------------- 5. deploy
//
// Deploy harus lebih dulu daripada pemasangan secret: "wrangler secret put"
// butuh Worker yang sudah ada. Pada akun baru urutannya dibalik membuat
// semua secret gagal.
//
// Catatan: versi pertama sempat jalan tanpa SESSION_SECRET, jadi ada jendela
// beberapa detik sebelum secret terpasang. Untuk instalasi baru risikonya
// sangat kecil, tapi jangan sebarkan URL-nya sebelum langkah selesai.
langkah(5, TOTAL, 'Build & deploy');
const kodeBuild = await new Promise((selesai) => {
  const c = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  c.on('close', (code) => selesai(code));
});
if (kodeBuild !== 0) {
  err('      Build gagal.');
  process.exit(1);
}
ok('build selesai');

const deploy = await jalankan(['deploy'], { cwd: API });
if (deploy.code !== 0) {
  err('      Deploy gagal. Jalankan: npx wrangler deploy');
  process.exit(1);
}
const versi = deploy.out.match(/Current Version ID:\s*(\S+)/)?.[1];
ok(`deploy Worker ${versi ? '(' + versi.slice(0, 8) + '…)' : ''}`);

// ---------------------------------------------------------------- 6. secret
langkah(6, TOTAL, 'Memasang secret acak');

// Password admin HARUS ditampilkan. Pada instalasi baru, akun admin
// di-seed memakai nilai secret ADMIN_PASSWORD; kalau tidak dicetak, pemilik
// instalasi tidak akan pernah bisa masuk.
const adminPassword = crypto.randomBytes(12).toString('base64url');

const pasang = async (nama, nilai) => {
  await new Promise((selesai) => {
    // secret put membaca binding dari wrangler.toml, jadi tetap dari apps/api.
    const child = spawn(process.execPath, [WRANGLER, 'secret', 'put', nama], { cwd: API, stdio: ['pipe', 'pipe', 'pipe'] });
    let o = '';
    child.stdout.on('data', (d) => (o += d));
    child.stderr.on('data', (d) => (o += d));
    child.on('close', () => {
      ok(/success|uploaded/i.test(o.replace(/\u001b\[[0-9;]*m/g, '')) ? nama : `${nama} (gagal)`);
      selesai();
    });
    child.stdin.write(nilai + '\n');
    child.stdin.end();
  });
};
await pasang('SESSION_SECRET', crypto.randomBytes(32).toString('base64url'));
await pasang('CRON_SECRET', crypto.randomBytes(24).toString('base64url'));
await pasang('ADMIN_PASSWORD', adminPassword);

// Perbaiki akun admin pada instalasi baru.
//
// Worker di-deploy pada langkah 5, jadi ensureAdminUser sudah membuat akun
// admin memakai nilai ADMIN_PASSWORD yang saat itu belum terpasang - yaitu
// nilai bawaan. Akibatnya password yang dicetak di bawah tidak cocok.
// Pada instalasi baru saja hash-nya ditulis ulang; instalasi yang sudah
// punya data tidak disentuh sama sekali.
if (d1Baru) {
  const iterations = 100_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(adminPassword, salt, iterations, 32, 'sha256');
  const b64url = (buf) => buf.toString('base64url');
  const stored = `pbkdf2$sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;

  const dir = mkdtempSync(join(tmpdir(), 'pf-pass-'));
  const file = join(dir, 'set.sql');
  writeFileSync(file, `UPDATE users SET password_hash = '${stored}' WHERE username = 'admin'`);
  const hasil = await jalankan(['d1', 'execute', NAMA.d1, '--remote', '--file', file]);
  rmSync(dir, { recursive: true, force: true });
  ok(hasil.code === 0 ? 'password admin disesuaikan' : 'password admin GAGAL disesuaikan');
}

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
l(`  R2           : ${r2 ?? 'belum aktif (media nonaktif)'}`);
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
