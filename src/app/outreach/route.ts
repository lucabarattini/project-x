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
  emails?: Array<{ email: string; type?: string; grade?: string; source: string; role?: "to" | "bcc" | "skip"; note?: string }>;
  draft?: { subject: string; body: string };
  status?: string;
  // Filled from Gemma's Gmail: when the email went out, and what came back.
  sentAt?: string;
  repliedAt?: string;
  bouncedAt?: string;
  dropped?: string;
  // How close the role is to Gemma's path, ranked within the company (1 = write first).
  fit?: { rank: number; function: string; open: string[] };
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

// Five days after sending, anyone who neither replied nor bounced gets a follow-up.
const followUpDate = (sentAt: string) => new Date(Date.parse(sentAt) + 5 * 86_400_000).toISOString().slice(0, 10);

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

// One row per company plus a total: how far each list got, from found to replied.
function dashboard(contacts: Contact[]) {
  const companies = [...new Set(contacts.map((contact) => contact.company)), "All"];
  const rows = companies.map((company) => {
    const list = company === "All" ? contacts : contacts.filter((contact) => contact.company === company);
    const sent = list.filter((contact) => contact.sentAt).length;
    const replied = list.filter((contact) => contact.repliedAt).length;
    const bounced = list.filter((contact) => contact.bouncedAt).length;
    const cells = [
      list.length,
      list.filter((contact) => contact.emails?.some((email) => email.role !== "skip")).length,
      list.filter((contact) => contact.status?.startsWith("in Gmail drafts")).length,
      sent, replied, bounced, percent(replied, sent - bounced),
    ];
    const style = company === "All" ? "font-weight:600" : `background:${companyColors[company] ?? "#fff"}`;
    return `<tr style="${style}"><td>${escape(company)}</td>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  });
  return `<table style="width:auto;margin-bottom:24px"><thead><tr><th>Company</th><th>People</th><th>Usable email</th><th>In drafts</th><th>Sent</th><th>Replied</th><th>Bounced</th><th>Reply rate</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

async function readContacts(): Promise<Contact[]> {
  const result = await get(contactsPath, { access: "private", useCache: false }).catch(() => null);
  if (result?.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text()) as Contact[];
}

// The companies Gemma is writing to right now; everyone else sits in the collapsed "On hold" list.
const currentCompanies = ["Voleon", "Starbucks", "Nordstrom"];

// Companies keep their priority order; inside each one: replied, waiting on a reply, bounced, not sent yet,
// and within each of those, the best role fit first. Each company opens with a heading row as a break.
function contactTable(contacts: Contact[]) {
  const companies = [...new Set(contacts.map((contact) => contact.company))];
  const stage = (contact: Contact) => (contact.repliedAt ? 0 : contact.bouncedAt ? 2 : contact.sentAt ? 1 : 3);
  const rows = companies.map((company) => {
    const people = contacts.filter((contact) => contact.company === company)
      .sort((a, b) => stage(a) - stage(b) || (a.fit?.rank ?? 99) - (b.fit?.rank ?? 99));
    const heading = `<tr><td colspan="8" style="border:none;padding:22px 8px 6px"><b style="font-size:16px">${escape(company)}</b> <small>${people.length} people</small></td></tr>`;
    return heading + people.map((contact, index) => `<tr style="background:${companyColors[company] ?? "#fff"}">
<td>${index + 1}</td>
<td><a href="${escape(contact.linkedin)}" target="_blank" rel="noreferrer">${escape(contact.name)}</a><br><small>${escape(contact.title)} · ${escape(contact.location)}</small></td>
<td><b>${escape(contact.hook)}</b>${contact.fit ? `<br><small>fit #${contact.fit.rank} · ${escape(contact.fit.function)}</small>` : ""}</td>
<td>${(contact.emails ?? []).filter((email) => email.role !== "skip").map((email) => `${escape(email.email)}<br><small>${escape([email.role?.toUpperCase(), email.source].filter(Boolean).join(" · "))}</small>`).join("<br>")}</td>
<td style="text-align:center">${contact.sentAt ? `✅<br><small>${escape(contact.sentAt)}</small>` : ""}</td>
<td style="text-align:center">${contact.repliedAt ? `✅<br><small>${escape(contact.repliedAt)}</small>` : contact.sentAt ? `❌${contact.bouncedAt ? "" : `<br><small>follow up ${followUpDate(contact.sentAt)}</small>`}` : ""}</td>
<td style="text-align:center">${contact.bouncedAt ? `bounced<br><small>${escape(contact.bouncedAt)}</small>` : ""}</td>
<td><small>${escape(contact.status ?? "")}</small></td>
</tr>`).join("");
  }).join("");
  return `<table><thead><tr><th>#</th><th>Person</th><th>Hook</th><th>Email</th><th>Email sent</th><th>Replied</th><th>Bounce back</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function GET(request: Request) {
  if (!isSignedIn(request)) return loginForm();
  const listed = (await readContacts()).filter((contact) => !contact.dropped);
  const current = currentCompanies.flatMap((company) => listed.filter((contact) => contact.company === company));
  const onHold = listed.filter((contact) => !currentCompanies.includes(contact.company));
  const onHoldCompanies = [...new Set(onHold.map((contact) => contact.company))];
  return page(`<h1>Outreach for Gemma</h1>
${dashboard([...current, ...onHold])}
<h2>Current outbound</h2>
${contactTable(current)}
<details style="margin-top:40px"><summary style="cursor:pointer;font-size:18px;font-weight:600">On hold <small>${onHold.length} people · ${escape(onHoldCompanies.join(", "))}</small></summary>
${contactTable(onHold)}
</details>`);
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
