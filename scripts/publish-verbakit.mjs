/**
 * Menjalankan unpublish paket lama @verbakit/* lalu publish paket baru
 * @verbakit/*.
 *
 * HARUS dijalankan di terminal Anda sendiri, bukan dari sesi assistant:
 * publish dan unpublish npm memerlukan OTP, dan URL auth-nya disembunyikan
 * kalau output bukan terminal interaktif (menjadi "***").
 *
 * Pemakaian: npm run publish:verbakit
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NPM = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
const root = process.cwd();

function npm(args, cwd = root) {
  process.stdout.write(`\n>>> npm ${args.join(' ')}\n`);
  try {
    const out = execFileSync(process.execPath, [NPM, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const tail = out.split('\n').filter((l) => l.trim()).slice(-4).join('\n');
    if (tail) console.log(tail);
    return { ok: true };
  } catch (error) {
    const detail = (error.stderr?.toString() || error.stdout?.toString() || error.message)
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 8)
      .join('\n');
    console.log(detail);
    return { ok: false, detail };
  }
}

const needOtp = (detail = '') => /EOTP|one-time password/i.test(detail);

// Nama paket lama ditulis sebagai potongan agar tidak ikut berubah bila
// proyek di-rename lagi.
const PAKET_LAMA = [`@press${'forge'}/core`, `@press${'forge'}/plugin-sdk`];

console.log(`=== Langkah 1: hapus paket lama (${PAKET_LAMA.join(', ')}) ===`);
for (const pkg of PAKET_LAMA) {
  const r = npm(['unpublish', pkg, '--force']);
  if (!r.ok) {
    if (needOtp(r.detail)) {
      console.log('\nOTP diperlukan: buka URL yang ditampilkan di atas, selesaikan di browser,');
      console.log('lalu jalankan ulang: npm run publish:verbakit\n');
      process.exit(2);
    }
    if (/E404|not found|cannot find/i.test(r.detail)) {
      console.log('(sudah tidak ada, dilewati)');
    }
  }
}

console.log('\n\n=== Langkah 2: terbitkan paket baru @verbakit/* ===');
for (const dir of ['packages/core', 'packages/plugin-sdk']) {
  const file = join(root, dir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));

  if (!pkg.name?.startsWith('@verbakit/')) {
    console.log(`\n${pkg.name} belum diubah ke @verbakit/ - dilewati`);
    continue;
  }
  if (!pkg.version) {
    console.log(`\n${pkg.name} belum punya dist/ (jalankan: npm run build:packages)`);
    continue;
  }

  const r = npm(['publish'], join(root, dir));
  if (!r.ok && needOtp(r.detail)) {
    console.log('\nOTP diperlukan. Setelah selesai di browser, jalankan ulang: npm run publish:verbakit\n');
    process.exit(2);
  }
}

console.log('\n\nSelesai. Cek hasil di:');
console.log('  https://www.npmjs.com/package/@verbakit/core');
console.log('  https://www.npmjs.com/package/@verbakit/plugin-sdk\n');
