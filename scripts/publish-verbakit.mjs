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
import { existsSync, readFileSync } from 'node:fs';
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
const SCOPE_BARU = '@kodenesiadigital';
const PAKET_BARU = ['@kodenesiadigital/verbakit-core', '@kodenesiadigital/verbakit-plugin-sdk'];

console.log(`=== Langkah 0: cek paket baru belum ada ===`);
for (const pkg of PAKET_BARU) {
  try {
    execFileSync(process.execPath, [NPM, 'view', pkg], { encoding: 'utf8', input: '\n', stdio: 'pipe' });
    console.log(`${pkg} sudah ada. Tidak ada yang perlu diterbitkan.`);
    process.exit(0);
  } catch {
    // Belum ada - lanjut.
  }
}
console.log(`${PAKET_BARU.join(' dan ')} belum ada - akan dicoba publish.\n`);

console.log(`\n=== Langkah 1 (opsional): hapus paket lama ===`);
console.log('Paket lama tidak menghalangi penerbitan. Kalau penghapusan gagal');
console.log('karena butuh kode OTP, diabaikan saja dan publish tetap berjalan.\n');

for (const pkg of PAKET_LAMA) {
  const r = npm(['unpublish', pkg, '--force']);
  if (!r.ok) {
    console.log(
      `\n${pkg} belum terhapus - tidak masalah, paket lama hanya jadi tidak terpakai.` +
        '\n Bisa dihapus nanti dengan: npm unpublish ' + pkg + ' --force --otp <kode>\n',
    );
  }
}

console.log('\n\n=== Langkah 2: terbitkan paket baru ===');
for (const dir of ['packages/core', 'packages/plugin-sdk']) {
  const file = join(root, dir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));

  if (!pkg.name?.startsWith(`${SCOPE_BARU}/`)) {
    console.log(`\n${pkg.name} di luar scope ${SCOPE_BARU} - dilewati`);
    continue;
  }
  if (pkg.private === true) {
    console.log(`\n${pkg.name} ditandai private - npm akan menolak, dilewati`);
    process.exit(2);
  }
  if (!existsSync(join(root, dir, 'dist', 'index.js'))) {
    console.log(`\n${pkg.name} belum punya dist/ - jalankan: npm run build:packages`);
    process.exit(2);
  }

  // --access public WAJIB. Tanpa itu npm menganggap paket di scope baru ini
  // privat dan membalas E402 "You must sign up for private packages"
  // pada akun free. Ini juga sudah dipasang lewat publishConfig di
  // package.json, tapi flag ini menjaga kalau publish dipanggil langsung.
  const r = npm(['publish', '--access', 'public'], join(root, dir));
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
console.log('  https://www.npmjs.com/package/@kodenesiadigital/verbakit-core');
console.log('  https://www.npmjs.com/package/@kodenesiadigital/verbakit-plugin-sdk\n');
