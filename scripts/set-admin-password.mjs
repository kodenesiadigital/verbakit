/**
 * Mengatur ulang password admin PressForge di Cloudflare D1.
 *
 * Password di-generate DI TERMINAL PENGGUNA lalu langsung disimpan ke D1.
 * Nilainya hanya dicetak sekali ke layar Anda - tidak pernah lewat ke
 * environment, log, atau proses lain.
 *
 * Pemakaian: npm run set-admin-password
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const apiDir = join(repo, 'apps', 'api');
const wrangler = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const args = process.argv.slice(2);
const database = args[0] ?? 'pressforge-db';
const username = args[1] ?? 'admin';

// Validasi: mencegah argumeniguously (mis. --help) diperlakukan sebagai nama
// database sehingga perintah tak sengaja dijalankan.
for (const [label, value] of [
  ['database', database],
  ['username', username],
]) {
  if (value.startsWith('-')) {
    console.error(`Argumen ${label} tidak boleh diawali tanda hubung: "${value}"`);
    console.error('Pemakaian: npm run set-admin-password -- [database] [username]');
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    console.error(`Argumen ${label} hanya boleh huruf, angka, tanda hubung, dan garis bawah: "${value}"`);
    process.exit(1);
  }
}

// Password acak 20 karakter, mudah dibaca tanpa karakter ambigu.
const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = Array.from(crypto.randomBytes(20), (b) => alphabet[b % alphabet.length]).join('');

// Format harus sama dengan src/security.ts
const iterations = 100_000;
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const b64url = (b) => b.toString('base64url');
const stored = `pbkdf2$sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;

// SQL ditulis ke file sementara supaya hash tidak muncul di process args/log.
const dir = mkdtempSync(join(tmpdir(), 'pf-pw-'));
const sqlFile = join(dir, 'set-password.sql');
const escaped = stored.replace(/'/g, "''");
writeFileSync(sqlFile, `UPDATE users SET password_hash = '${escaped}' WHERE username = '${username}';\n`);

console.log(`Memperbarui password user "${username}" pada database "${database}"...\n`);

try {
  execFileSync(
    process.execPath,
    [wrangler, 'd1', 'execute', database, '--remote', '--file', sqlFile, '--yes'],
    { cwd: apiDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  const detail = error.stderr?.toString() || error.stdout?.toString() || error.message;
  console.error('GAGAL:', detail.trim().split('\n').slice(-3).join('\n'));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('Password berhasil diperbarui.\n');
console.log('  ' + '-'.repeat(46));
console.log('  username : ' + username);
console.log('  password : ' + password);
console.log('  ' + '-'.repeat(46));
console.log('\nLogin: https://pressforge-api.kodenesiadigital.workers.dev/admin');
console.log('Simpan password ini sekarang - tidak bisa dilihat lagi.\n');
console.log('Lupa lagi? Jalankan ulang: npm run set-admin-password\n');
