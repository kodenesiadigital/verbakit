import type { Env } from './types.ts';

/**
 * Jembatan untuk mengantrekan pekerjaan latar (khususnya dispatch event ke
 * plugin service). Module ini menyimpan antrean per-Environment yang diisi
 * worker pada awal request lewat `bind`.
 */

type Scheduler = (promise: Promise<unknown>) => void;

const schedulers = new WeakMap<Env, Scheduler>();

/** Dipanggil worker sekali per request. */
export function bind(env: Env, waitUntil: Scheduler): void {
  schedulers.set(env, waitUntil);
}

/**
 * Jalankan di latar belakang tanpa memblokir respons. Kalau promise-nya
 * diabaikan, Worker bisa membatalkannya sebelum request terkirim.
 */
export function runInBackground(env: Env, promise: Promise<unknown>): void {
  const schedule = schedulers.get(env);
  if (schedule) {
    schedule(promise.catch(() => undefined));
    return;
  }
  void promise.catch(() => undefined);
}
