/**
 * Build paket yang akan dipublikasikan ke npm.
 *
 * Sumber memakai import ber-extension .ts (mis. './hooks.ts') supaya bisa
 * dipakai langsung oleh toolchain internal. Extension itu tidak ditulis
 * ulang oleh tsc, jadi untuk paket yang terbit kita bundel dengan esbuild
 * menjadi satu berkas .js, lalu hasil deklarasi (.d.ts) dihasilkan tsc
 * dengan emitDeclarationOnly.
 *
 * Pemakaian: node scripts/build-package.mjs <dir-paket> [external...]
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , pkgDirArg, ...external] = process.argv;
if (!pkgDirArg) {
  console.error('Pemakaian: node scripts/build-package.mjs <dir-paket> [external...]');
  process.exit(1);
}

const pkgDir = resolve(process.cwd(), pkgDirArg);
const outDir = join(pkgDir, 'dist');
const entry = join(pkgDir, 'src', 'index.ts');
const outfile = join(outDir, 'index.js');

if (!existsSync(entry)) {
  console.error(`entry tidak ditemukan: ${entry}`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  // Dependensi peer antar-paket tetap external; dipaketkan dari npm.
  external,
  logLevel: 'warning',
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`  bundle   : dist/index.js (${(bytes / 1024).toFixed(1)} kB)`);

// Deklarasi tipe untuk konsumen TypeScript.
// typescript di-hoist ke root oleh npm workspaces, jadi cari lewat
// createRequire dari paket ini, bukan menebak path node_modules lokal.
const require = createRequire(join(pkgDir, 'package.json'));
let tscPath;
try {
  tscPath = require.resolve('typescript/bin/tsc');
} catch {
  tscPath = join(pkgDir, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tscPath)) {
    console.error('typescript tidak ditemukan; jalankan npm install');
    process.exit(1);
  }
}

execFileSync(process.execPath, [tscPath, '-p', join(pkgDir, 'tsconfig.build.json')], {
  cwd: pkgDir,
  stdio: 'inherit',
});
console.log('  deklarasi: dist/index.d.ts');

// Bukti bahwa bundle benar-benar bisa diimpor (bukan sekadar berhasil dibuild).
const mod = await import(pathToFileURL(outfile).href);
const exported = Object.keys(mod).sort();
if (exported.length === 0) {
  console.error('bundle tidak mengekspor apa pun');
  process.exit(1);
}
console.log(`  ekspor   : ${exported.join(', ')}`);
