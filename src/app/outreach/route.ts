import { createHmac, timingSafeEqual } from "node:crypto";
import { get } from "@vercel/blob";

/**
 * Private outreach list: the people Gemma is writing to, with their LinkedIn
 * links. The repo is public, so the list lives in the private Blob store
 * (outreach/contacts.json) and the page sits behind one password, kept in the
 * OUTREACH_PASSWORD env var. Raw HTML on purpose: it is a review sheet.
 */
export const dynamic = "force-dynamic";

const cookieName = "outreach";

// One light tint per company, so a long sheet reads in blocks.
const companyColors: Record<string, string> = {
  DRW: "#fde2e2", Stripe: "#e4e1fb", Shopify: "#ddf3df", Coinbase: "#dbe8fb", Nordstrom: "#efefef",
  Starbucks: "#d8efe6", Microsoft: "#fff1d6", DoorDash: "#ffe3d6", Amazon: "#fff7cc", Voleon: "#e2f4f6", Expedia: "#e7eefb",
};
const contactsPath = "outreach/contacts.json";

type Contact = {
  name: string;
  company: string;
  title: string;
  location: string;
  linkedin: string;
  hook: string;
  why: string;
  email?: string;
  emails?: Array<{ email: string; type?: string; grade?: string; source: string }>;
  draft?: { subject: string; body: string };
  status?: string;
};

function sessionToken() {
  const password = process.env.OUTREACH_PASSWORD;
  return password ? createHmac("sha256", password).update("outreach-session").digest("hex") : null;
}

function isSignedIn(request: Request) {
  const expected = sessionToken();
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)outreach=([a-f0-9]{64})/u)?.[1];
  return Boolean(expected && cookie && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected)));
}

function escape(value: string) {
  return value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);
}

function page(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outreach</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f5f5;position:sticky;top:0}a{color:#0645ad}small{color:#666}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...headers } },
  );
}

const loginForm = (error = "") =>
  page(`<form method="post"><p>${error}</p><input type="password" name="password" autofocus> <button>Enter</button></form>`, error ? 401 : 200);

async function readContacts(): Promise<Contact[]> {
  const result = await get(contactsPath, { access: "private", useCache: false }).catch(() => null);
  if (result?.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text()) as Contact[];
}

export async function GET(request: Request) {
  if (!isSignedIn(request)) return loginForm();
  const contacts = await readContacts();
  const rows = contacts.map((contact, index) => `<tr style="background:${companyColors[contact.company] ?? "#fff"}">
<td>${index + 1}</td>
<td><a href="${escape(contact.linkedin)}" target="_blank" rel="noreferrer">${escape(contact.name)}</a><br><small>${escape(contact.title)}</small></td>
<td>${escape(contact.company)}<br><small>${escape(contact.location)}</small></td>
<td><b>${escape(contact.hook)}</b><br><small>${escape(contact.why)}</small></td>
<td>${(contact.emails ?? []).map((email) => `${escape(email.email)}<br><small>${escape([email.type, email.grade, email.source].filter(Boolean).join(" · "))}</small>`).join("<br>")}</td>
<td>${contact.draft ? `<details><summary>${escape(contact.draft.subject)}</summary><pre style="white-space:pre-wrap;font:inherit">${escape(contact.draft.body)}</pre></details>` : ""}<small>${escape(contact.status ?? "")}</small></td>
</tr>`).join("");
  const withEmail = contacts.filter((contact) => contact.emails?.length).length;
  return page(`<h1>Outreach for Gemma <small>${contacts.length} people · ${withEmail} with an email</small></h1>
<table><thead><tr><th>#</th><th>Person</th><th>Company</th><th>Hook</th><th>Emails found</th><th>Draft</th></tr></thead><tbody>${rows}</tbody></table>`);
}

export async function POST(request: Request) {
  const password = process.env.OUTREACH_PASSWORD;
  const submitted = String((await request.formData()).get("password") ?? "");
  const matches = password !== undefined &&
    submitted.length === password.length &&
    timingSafeEqual(Buffer.from(submitted), Buffer.from(password));
  if (!matches) return loginForm("Wrong password");
  return new Response(null, {
    status: 303,
    headers: {
      location: "/outreach",
      "set-cookie": `${cookieName}=${sessionToken()}; Path=/outreach; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
    },
  });
}
