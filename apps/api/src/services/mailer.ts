import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Last messages "sent" — handy for local development and tests. */
export const outbox: Mail[] = [];

/**
 * Mail transport. MangaForEver ships without an email provider, so in development messages are
 * written to the server log (look for "📧"). Plug a provider (Resend, Postmark, SES…) in here
 * for production and set MAIL_FROM / provider credentials.
 */
export async function sendMail(mail: Mail) {
  outbox.push(mail);
  if (outbox.length > 50) outbox.shift();
  if (!env.isTest) {
    logger.info({ to: mail.to, subject: mail.subject }, "📧 Email (dev transport — not actually sent)");
    if (!env.isProd) console.log(`\n📧 To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
  }
}
