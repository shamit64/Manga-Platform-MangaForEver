import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. When omitted, a simple branded HTML version of `text` is sent. */
  html?: string;
}

/** Last messages "sent" — handy for local development and tests. */
export const outbox: Mail[] = [];

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Minimal editorial-dark HTML wrapper; links in the text become buttons-free plain anchors. */
export function brandedHtml(text: string, action?: { label: string; url: string }) {
  const body = escape(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#d9485a">$1</a>')}</p>`)
    .join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#b3263a;color:#f2efea;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escape(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;padding:32px 16px;font-family:Georgia,serif;color:#f2efea">
<div style="max-width:520px;margin:0 auto;background:#141416;border:1px solid #2a2a2e;border-radius:10px;padding:32px">
<div style="font-size:22px;letter-spacing:.02em;margin-bottom:24px">Manga<span style="color:#d9485a">For</span>Ever</div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#d8d4cd">${button}${body}</div>
</div></body></html>`;
}

/**
 * Mail transport. With RESEND_API_KEY set, messages go out through Resend's HTTP API; otherwise they
 * are written to the server log (look for "📧") so local development needs no email account.
 */
export async function sendMail(mail: Mail) {
  outbox.push(mail);
  if (outbox.length > 50) outbox.shift();
  if (env.isTest) return;
  if (!env.RESEND_API_KEY) {
    logger.info({ to: mail.to, subject: mail.subject }, "📧 Email (dev transport — not actually sent)");
    if (!env.isProd) console.log(`\n📧 To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html ?? brandedHtml(mail.text) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.error({ status: res.status, body: (await res.text()).slice(0, 300) }, "Resend rejected an email");
  } catch (err) {
    // Email failures never break the request that triggered them.
    logger.error({ err }, "Email delivery failed");
  }
}
