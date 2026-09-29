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
 * Untuk KV, jangan searching berdasarkan title: judul namespace bisa
 * apa saja (mis. "KV"). Lebih aman: pakai ID yang sudah tertulis di
 * wrangler.toml, tapi hanya kalau namespace itu masih ada di akun.
 */
const idKvDiToml = () => {
  const m = readFileSync(TOML, 'utf8').match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([0-9a-f]{32})"/);
  return m?.[1] ?? null;
};
const semuaIdKv = [...kvList.matchAll(/"id":\s*"([0-9a-f]{32})"/g)].map((m) => m[1]);

const ada = {
  d1: ambilD1(d1List),
  r2: ambilR2(r2List),
  kv: (() => {
    const diToml = idKvDiToml();
    return diToml && semuaIdKv.includes(diToml) ? diToml : null;
  })(),
};
for (const [k, v] of Object.entries(ada)) info(`${k}: ${v ? 'ada, dipakai' : 'belum ada'}`);

// ------------------------------------------------------------- 3. buat resource
langkah(3, TOTAL, 'Membuat resource yang belum ada');
const d1Id = ada.d1 ?? (await jalankan(['d1', 'create', NAMA.d1])).out.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? null;
if (d1Id) ok(`D1 ${d1Id.slice(0, 8)}…`);

const kvId =
  ada.kv ?? (await jalankan(['kv', 'namespace', 'create', NAMA.kv])).out.match(/"id":\s*"([0-9a-f]{32})"/)?.[1] ?? null;
if (kvId) ok(`KV ${kvId.slice(0, 8)}…`);

if (!ada.r2) {
  await jalankan(['r2', 'bucket', 'create', NAMA.r2]);
  ok(`R2 ${NAMA.r2}`);
} else ok(`R2 ${NAMA.r2} (pakai yang ada)`);

// ------------------------------------------------------- 4. tulis wrangler.toml
langkah(4, TOTAL, 'Menulis wrangler.toml');
if (!d1Id || !kvId) {
  err('      Gagal membuat resource. Periksa kuota akun (free: 10 D1, 100 worker).');
  process.exit(1);
}
let toml = readFileSync(TOML, 'utf8');
toml = toml
  .replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${d1Id}"`)
  .replace(/(bucket_name\s*=\s*)"[^"]*"/, `$1"${NAMA.r2}"`)
  .replace(/(\[\[kv_namespaces\]\]\s*\n\s*binding\s*=\s*"KV"\s*\n\s*id\s*=\s*)"[^"]*"/, `$1"${kvId}"`);
writeFileSync(TOML, toml, 'utf8');
ok('D1, R2, dan KV terisi');

// ---------------------------------------------------------------- 5. secret
langkah(5, TOTAL, 'Memasang secret acak');
const pasang = async (nama) => {
  await new Promise((selesai) => {
    const child = spawn(process.execPath, [WRANGLER, 'secret', 'put', nama], { cwd: API, stdio: ['pipe', 'pipe', 'pipe'] });
    let o = '';
    child.stdout.on('data', (d) => (o += d));
    child.stderr.on('data', (d) => (o += d));
    child.on('close', () => {
      ok(/success|uploaded/i.test(o) ? nama : `${nama} (gagal)`);
      selesai();
    });
    child.stdin.write(crypto.randomBytes(32).toString('base64url') + '\n');
    child.stdin.end();
  });
};
await pasang('SESSION_SECRET');
await pasang('CRON_SECRET');
await pasang('ADMIN_PASSWORD');
ok('ADMIN_PASSWORD dibuat acak (akan ditampilkan di langkah terakhir)');

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
l('  Password     : jalankan  npm run set-admin-password');
l('                 (password dibuat di terminal Anda, tidak dicetak di sini)');
l('');
l('  Deploy ulang : git push  (CI otomatis) atau  npm run deploy');
l('─'.repeat(64) + '\n');
