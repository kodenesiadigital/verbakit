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
const SCOPE_BARU = '@verbakit';

console.log('=== Langkah 0: pastikan scope sudah dimiliki ===');
console.log(`Paket baru memakai scope ${SCOPE_BARU}/. Scope hanya bisa dipakai`);
console.log('jika ada akun atau organisasi dengan nama tersebut di npm.\n');

try {
  execFileSync(process.execPath, [NPM, 'view', `${SCOPE_BARU}/core`], {
    encoding: 'utf8',
    input: '\n',
    stdio: 'pipe',
  });
  console.log(`Paket ${SCOPE_BARU}/core sudah ada - lewati publish.`);
  process.exit(0);
} catch {
  // Tidak ada - lanjut. Error belum tentu berarti scope tidak dimiliki,
  // jadi tetap dicoba publish; if sampai gagal, pesannya yang bicara.
}

console.log(`Scope ${SCOPE_BARU} belum ada - akan dicoba publish.`);
console.log('Kalau nanti muncul "you do not have permission", buat organisasi dulu:');
console.log('  https://www.npmjs.com -> Add new organization -> ' + SCOPE_BARU.slice(1) + '\n');

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
