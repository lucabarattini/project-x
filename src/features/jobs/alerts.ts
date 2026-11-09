import { execFileSync } from "node:child_process";
import { isSeattleArea, isUsRemote } from "./filters";
import { mapWithinDeadline } from "./providers/concurrency";
import { targetCompanies } from "./search";
import { rowKey, type IndexRow } from "./search-model";

/** A role at a target company that is remote in the U.S. or in Washington State. */
export function isAlertRole(row: IndexRow) {
  return targetCompanies.has(row[2]) && (isUsRemote(row[4]) || isSeattleArea(row[4]));
}

/** The same opening can come back under a new id, so alerts remember company, title and location. */
export const alertKey = (row: IndexRow) => `${row[2]}|${row[1].trim().toLowerCase()}|${row[4]}`;

const escape = (value: string) => value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);

/** The digest goes out once a day, with the first build after this hour (UTC): about 7-8 am in New York. */
const digestHourUtc = 12;

/** Whether a build at `now` should send the day's digest, given the day the last one went out. */
export function digestDue(lastDigest: string | null, now = new Date()) {
  return now.getUTCHours() >= digestHourUtc && lastDigest !== now.toISOString().slice(0, 10);
}

// Anonymous on purpose: the repository is public.
const fitQuestion = `Is this job a realistic fit for the candidate below, worth applying to now?
Fits: financial analyst and senior financial analyst, FP&A, accounting, treasury, pricing, allocator, planner,
assistant buyer and buyer, merchandising, strategy and operations, business or data analyst, and similar corporate
roles that lean on financial modeling and analysis. "Senior" analyst titles still fit: judge by the years asked,
and a role asking for up to about 4 years, or not saying, can fit.
Not a fit: store, warehouse, manufacturing, security, spa, driver, hourly or seasonal roles; software, hardware or
security engineering; recruiting; and people-manager or executive roles such as manager of a team, senior manager,
principal, director or VP.
Candidate: bachelor's in economics with accounting and business analytics, about one year of full-time consulting in
consumer and retail (supplier cost models, margin and COGS analysis), strong in Excel, Power BI, SQL and Python.`;

/**
 * Asks GPT-6 Luna, through OpenAI's Decisions API, whether each role is worth
 * Gemma's time. A role whose call fails gets no verdict and waits for the next build.
 */
export async function judgeFit(rows: IndexRow[], texts: Map<string, string>, apiKey: string) {
  const fits = new Map<IndexRow, boolean>();
  await mapWithinDeadline(rows, 10, Date.now(), 90_000, async (row) => {
    const text = texts.get(rowKey({ boardToken: row[3], id: row[0] })) ?? "";
    const response = await fetch("https://api.openai.com/v1/decisions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6-luna",
        input: `${row[1]} at ${row[2]}, ${row[4]}\n\n${text}`,
        questions: [{ type: "predicate", name: "fit", instructions: fitQuestion }],
      }),
    }).catch(() => null);
    if (!response?.ok) return;
    const { answers } = await response.json() as { answers?: Array<{ probability?: number }> };
    const probability = answers?.[0]?.probability;
    if (typeof probability === "number") fits.set(row, probability >= 0.5);
  });
  return fits;
}

/** "Posted Mon, Nov 9 (today)", counted in calendar days. */
export function postedLabel(value: string | null, now = new Date()) {
  if (!value) return "Posting date not given";
  const date = new Date(value);
  const day = (moment: Date) => Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate());
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  const ago = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `Posted ${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} (${ago})`;
}

export function alertEmail(rows: IndexRow[], skipped = 0, now = new Date()) {
  const sorted = [...rows].sort((left, right) => left[2].localeCompare(right[2]) || left[1].localeCompare(right[1]));
  const intro = `${rows.length} new ${rows.length === 1 ? "role" : "roles"} worth a look at Nordstrom, Shopify and Starbucks, remote in the U.S. or in Washington, since the last digest.`;
  const footer = skipped ? `${skipped} other new ${skipped === 1 ? "role was" : "roles were"} left out as not a fit.` : "";
  return {
    subject: "Daily job digest from Luca",
    text: `${intro}\n\n${sorted.map((row) => `${row[1]}\n${row[2]} · ${row[4]}\n${postedLabel(row[6], now)}\n${row[5]}`).join("\n\n")}${footer ? `\n\n${footer}` : ""}`,
    html: `<p>${intro}</p><ul>${sorted.map((row) =>
      `<li style="margin-bottom:10px"><a href="${escape(row[5])}">${escape(row[1])}</a><br>${escape(row[2])} · ${escape(row[4])}<br><b>${postedLabel(row[6], now)}</b></li>`).join("")}</ul>${footer ? `<p style="color:#666">${footer}</p>` : ""}`,
  };
}

/** Sends through Amazon SES with the AWS CLI, which GitHub's runners and this laptop both have. */
export function sendAlert(
  rows: IndexRow[],
  { from, to, region, skipped = 0 }: { from: string; to: string[]; region: string; skipped?: number },
) {
  const { subject, text, html } = alertEmail(rows, skipped);
  const input = {
    FromEmailAddress: from,
    Destination: { ToAddresses: to },
    Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } } },
  };
  execFileSync("aws", ["sesv2", "send-email", "--region", region, "--cli-input-json", JSON.stringify(input)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}
