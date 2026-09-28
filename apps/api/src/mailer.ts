/**
 * Mailer minimal dengan provider yang bisa ditukar.
 *
 * Provider ditentukan dari environment variable:
 *   RESEND_API_KEY  -> memakai Resend (https://resend.com)
 *   (kosong)        -> tautan hanya dicatat di log Worker (mode pengembangan)
 *
 * Ganti/tambah provider cukup di {@link getMailer}.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface Mailer {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

export interface MailerEnv {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
}

class LogMailer implements Mailer {
  readonly name = 'log';

  async send(message: MailMessage): Promise<void> {
    // Hanya log URL di mode dev, jangan pernah mencetak isi email pengguna.
    const links = message.text.match(/https?:\/\/\S+/g) ?? [];
    console.log(`[mail:log] to=${message.to} subject="${message.subject}"`);
    for (const link of links) console.log(`[mail:log]   ${link}`);
  }
}

class ResendMailer implements Mailer {
  readonly name = 'resend';
  readonly #apiKey: string;
  readonly #from: string;

  constructor(apiKey: string, env: MailerEnv) {
    this.#apiKey = apiKey;
    const name = env.MAIL_FROM_NAME?.trim() || 'Verbakit';
    const address = env.MAIL_FROM?.trim() || 'onboarding@resend.dev';
    this.#from = address.includes('<') ? address : `${name} <${address}>`;
  }

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.#from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resind HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
  }
}

export function getMailer(env: MailerEnv): Mailer {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return new LogMailer();
  return new ResendMailer(key, env);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Email reset password. Dilempar error bila provider gagal. */
export async function sendPasswordResetEmail(mailer: Mailer, email: string, link: string): Promise<void> {
  const safeLink = escapeHtml(link);
  await mailer.send({
    to: email,
    subject: 'Atur ulang password Verbakit Anda',
    text: [
      'Halo,',
      '',
      'Ada permintaan untuk mengatur ulang password akun Verbakit Anda.',
      'Buka tautan berikut untuk membuat password baru:',
      '',
      link,
      '',
      'Tautan berlaku 30 menit dan hanya dapat dipakai satu kali.',
      'Jika Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px">Atur ulang password</h1>
    <p style="margin:0 0 12px">Ada permintaan untuk mengatur ulang password akun Verbakit Anda.</p>
    <p style="margin:0 0 20px">
      <a href="${safeLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600">Buat password baru</a>
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px">Jika tombol tidak berfungsi, salin tautan ini:</p>
    <p style="margin:0 0 20px;color:#2563eb;font-size:13px;word-break:break-all">${safeLink}</p>
    <p style="margin:0;color:#64748b;font-size:13px">Tautan berlaku 30 menit dan hanya dapat dipakai satu kali. Jika Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.</p>
  </div>
</body></html>`,
  });
}
