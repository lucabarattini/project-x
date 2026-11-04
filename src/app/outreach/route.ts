import { timingSafeEqual } from "node:crypto";
import { get } from "@vercel/blob";
import { escapeHtml as escape, isSignedIn, reviewPage as page, sessionToken } from "@/features/outreach/session";

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
  Crusoe: "#f3e8fb",
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
  followedUpAt?: string;
  dropped?: string;
  // How close the role is to Gemma's path, ranked within the company (1 = write first).
  fit?: { rank: number; function: string; open: string[] };
  // Decision makers for the Shopify FP&A push, listed in their own section instead of under Shopify.
  track?: "director" | "recruiter";
};

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
      sent, list.filter((contact) => contact.followedUpAt).length, replied, bounced, percent(replied, sent - bounced),
    ];
    const style = company === "All" ? "font-weight:600" : `background:${companyColors[company] ?? "#fff"}`;
    return `<tr style="${style}"><td>${escape(company)}</td>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  });
  return `<table style="width:auto;margin-bottom:24px"><thead><tr><th>Company</th><th>People</th><th>Usable email</th><th>In drafts</th><th>Sent</th><th>Followed up</th><th>Replied</th><th>Bounced</th><th>Reply rate</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

async function readContacts(): Promise<Contact[]> {
  const result = await get(contactsPath, { access: "private", useCache: false }).catch(() => null);
  if (result?.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text()) as Contact[];
}

// The companies Gemma is writing to right now; everyone else sits in the collapsed "On hold" list.
const currentCompanies = ["Shopify", "Voleon", "Starbucks", "Nordstrom", "DoorDash", "Expedia", "Crusoe"];

// The one opening the Shopify push is about, and who decides on it.
const shopifyRole: [title: string, url: string] = [
  "Senior Financial Analyst - Multiple Roles (FP&A: Commercial Finance, Merchant Services, Corporate FP&A; hires FA and SFA; remote Americas)",
  "https://www.shopify.com/careers?ashby_jid=40ef1cb0-5c56-4963-84fe-946708e5d74a",
];
const tracks: Array<[track: NonNullable<Contact["track"]>, heading: string]> = [
  ["director", "Directors"],
  ["recruiter", "HR / recruiters"],
];

// The openings each current company is being contacted about, shown under its heading.
const targetRoles: Record<string, Array<[title: string, url: string]>> = {
  Shopify: [shopifyRole],
  Voleon: [["Tax Associate (remote, 1 yr)", "https://jobs.ashbyhq.com/voleon/8bcefe9b-6061-4951-96c5-eb9dec3994a1"]],
  Starbucks: [
    ["Supply Planner, Global Supply Chain", "https://apply.starbucks.com/careers/job/481080986214"],
    ["Logistics Network Analyst", "https://apply.starbucks.com/careers/job/481080977555"],
    ["Director, Planning & Business Operations", "https://apply.starbucks.com/careers/job/481080977556"],
  ],
  Nordstrom: [["Sr. Financial Analyst x3 (Corporate FP&A, Stores, Store Ops)", "https://nordstrom.wd501.myworkdayjobs.com/en-US/nordstrom_careers/job/Seattle-WA/Sr-Financial-Analyst---6-Open-Roles-----Hybrid---Seattle--WA-_R-832987"]],
  DoorDash: [["Associate, Finance & Strategy - DashPass (1-3+ yrs, Seattle among locations)", "https://job-boards.greenhouse.io/doordashusa/jobs/8278668"]],
  Expedia: [["Treasury Analyst, Banking Infrastructure (Seattle, 3+ yrs)", "https://careers.expediagroup.com/job/treasury-analyst-banking-infrastructure/seattle-wa/R-110518/"]],
  Crusoe: [["Senior Financial Analyst, Central Finance (Bellevue, on-site, 2-4 yrs; applied)", "https://jobs.ashbyhq.com/crusoe/62a01e46-9571-45b6-9205-13db16c4327f"]],
};

// Companies keep their priority order; inside each one: replied, waiting on a reply, bounced, not sent yet,
// and within each of those, the best role fit first. Each company opens with a heading row as a break.
// Grouped by company by default; the Shopify section groups by track (directors, recruiters) instead.
function contactTable(contacts: Contact[], groupOf: (contact: Contact) => string = (contact) => contact.company) {
  const groups = [...new Set(contacts.map(groupOf))];
  const stage = (contact: Contact) => (contact.repliedAt ? 0 : contact.bouncedAt ? 2 : contact.sentAt ? 1 : 3);
  const rows = groups.map((group) => {
    const people = contacts.filter((contact) => groupOf(contact) === group)
      .sort((a, b) => stage(a) - stage(b) || (a.fit?.rank ?? 99) - (b.fit?.rank ?? 99));
    const drafted = people.filter((contact) => contact.status?.startsWith("in Gmail drafts")).length;
    const roles = (targetRoles[group] ?? []).map(([title, url]) => `<a href="${escape(url)}" target="_blank" rel="noreferrer">${escape(title)}</a>`).join(" · ");
    const heading = `<tr><td colspan="8" style="border:none;padding:22px 8px 6px"><b style="font-size:16px">${escape(group)}</b> <small>${people.length} people${drafted ? ` · ${drafted} in Gmail drafts` : ""}</small>${roles ? `<br><small>Openings: ${roles}</small>` : ""}</td></tr>`;
    return heading + people.map((contact, index) => `<tr style="background:${companyColors[contact.company] ?? "#fff"}">
<td>${index + 1}</td>
<td><a href="${escape(contact.linkedin)}" target="_blank" rel="noreferrer">${escape(contact.name)}</a><br><small>${escape(contact.title)} · ${escape(contact.location)}</small></td>
<td><b>${escape(contact.hook)}</b>${contact.fit ? `<br><small>fit #${contact.fit.rank} · ${escape(contact.fit.function)}</small>` : ""}</td>
<td>${(contact.emails ?? []).filter((email) => email.role !== "skip").map((email) => `${escape(email.email)}<br><small>${escape([email.role?.toUpperCase(), email.source].filter(Boolean).join(" · "))}</small>`).join("<br>")}</td>
<td style="text-align:center">${contact.sentAt ? `✅<br><small>${escape(contact.sentAt)}</small>` : ""}</td>
<td style="text-align:center">${contact.repliedAt ? `✅<br><small>${escape(contact.repliedAt)}</small>` : contact.sentAt ? `❌${contact.bouncedAt ? "" : contact.followedUpAt ? `<br><small>followed up ${escape(contact.followedUpAt)}</small>` : `<br><small>follow up ${followUpDate(contact.sentAt)}</small>`}` : ""}</td>
<td style="text-align:center">${contact.bouncedAt ? `bounced<br><small>${escape(contact.bouncedAt)}</small>` : ""}</td>
<td><small>${escape(contact.status ?? "")}</small></td>
</tr>`).join("");
  }).join("");
  return `<table><thead><tr><th>#</th><th>Person</th><th>Hook</th><th>Email</th><th>Email sent</th><th>Replied</th><th>Bounce back</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function GET(request: Request) {
  if (!isSignedIn(request)) return loginForm();
  const all = (await readContacts()).filter((contact) => !contact.dropped);
  const tracked = tracks.flatMap(([track]) => all.filter((contact) => contact.track === track));
  const listed = all.filter((contact) => !contact.track);
  const current = currentCompanies.flatMap((company) => listed.filter((contact) => contact.company === company));
  const onHold = listed.filter((contact) => !currentCompanies.includes(contact.company));
  const onHoldCompanies = [...new Set(onHold.map((contact) => contact.company))];
  const trackHeading = new Map(tracks);
  return page(`<h1>Outreach for Gemma</h1>
${dashboard([...tracked, ...current, ...onHold])}
<h2>Shopify: who decides on the Financial Analyst opening</h2>
<p><small>Opening: <a href="${escape(shopifyRole[1])}" target="_blank" rel="noreferrer">${escape(shopifyRole[0])}</a><br>
Order: Kathryn's referral and application first, then directors citing it. Ask Kathryn which recruiter hired her.</small></p>
${contactTable(tracked, (contact) => trackHeading.get(contact.track!) ?? "")}
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
      // Site-wide: the same sign-in unlocks label corrections on the board.
      "set-cookie": `${cookieName}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
    },
  });
}
