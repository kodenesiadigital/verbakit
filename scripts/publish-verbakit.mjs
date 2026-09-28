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

/**
 * Jalankan npm dengan stdio 'inherit' - JANGAN me-pipe output.
 *
 * npm.onlyVueEditing.replaceText edit/menensor URL autentikasi OTP jadi "***"
 * kalau stdout-nya bukan TTY. Kalau output di-pipe, pengguna tidak
 * pernah mendapat URL untuk menyelesaikan OTP, dan perintah gagal
 * tanpa bisa dilanjutkan.
 */
function npm(args, cwd = root) {
  process.stdout.write(`\n>>> npm ${args.join(' ')}\n`);
  try {
    execFileSync(process.execPath, [NPM, ...args], { cwd, stdio: 'inherit' });
    return { ok: true };
  } catch {
    // Detail error sudah tampil langsung di terminal pengguna.
    return { ok: false, detail: '' };
  }
}

// Nama paket lama ditulis sebagai potongan agar tidak ikut berubah bila
// proyek di-rename lagi.
const PAKET_LAMA = [`@press${'forge'}/core`, `@press${'forge'}/plugin-sdk`];

console.log(`=== Langkah 1: hapus paket lama (${PAKET_LAMA.join(', ')}) ===`);
for (const pkg of PAKET_LAMA) {
  const r = npm(['unpublish', pkg, '--force']);
  if (!r.ok) {
    // Karena output tidak di-capture, errornya hanya bisa dilihat di terminal.
    // Hentikan saja: Publishing probably gagal atau Butuh OTP.
    console.log(
      `\nGagal menghapus ${pkg}. Pesan errornya ada di atas.` +
        '\nKalau muncul "one-time password", buka URL yang ditampilkan, selesaikan di browser,' +
        '\nlalu jalankan ulang: npm run publish:verbakit' +
        '\nKalau "not found", paket sudah tidak ada - lanjut ke langkah 2.\n',
    );
    process.exit(2);
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
  if (!r.ok) {
    console.log(
      `\nGagal menerbitkan ${pkg.name}. Pesan errornya ada di atas.` +
        '\nKalau muncul "one-time password", buka URL yang ditampilkan, selesaikan di browser,' +
        '\nlalu jalankan ulang: npm run publish:verbakit\n',
    );
    process.exit(2);
  }
}

console.log('\n\nSelesai. Cek hasil di:');
console.log('  https://www.npmjs.com/package/@verbakit/core');
console.log('  https://www.npmjs.com/package/@verbakit/plugin-sdk\n');
