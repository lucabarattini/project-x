import { createHmac, timingSafeEqual } from "node:crypto";

/** One password, kept in OUTREACH_PASSWORD, signs in to the outreach page and to label corrections. */
export function sessionToken() {
  const password = process.env.OUTREACH_PASSWORD;
  return password ? createHmac("sha256", password).update("outreach-session").digest("hex") : null;
}

export function isSignedIn(request: Request) {
  const expected = sessionToken();
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)outreach=([a-f0-9]{64})/u)?.[1];
  return Boolean(expected && cookie && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected)));
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);
}

/** The private sheets are raw HTML on purpose: they are for reading, not for show. */
export function reviewPage(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outreach</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f5f5;position:sticky;top:0}a{color:#0645ad}small{color:#666}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...headers } },
  );
}
