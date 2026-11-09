import { execFileSync } from "node:child_process";
import { isSeattleArea, isUsRemote } from "./filters";
import { targetCompanies } from "./search";
import type { IndexRow } from "./search-model";

/** A role at a target company that is remote in the U.S. or in Washington State. */
export function isAlertRole(row: IndexRow) {
  return targetCompanies.has(row[2]) && (isUsRemote(row[4]) || isSeattleArea(row[4]));
}

/** The same opening can come back under a new id, so alerts remember company, title and location. */
export const alertKey = (row: IndexRow) => `${row[2]}|${row[1].trim().toLowerCase()}|${row[4]}`;

const escape = (value: string) => value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);

export function alertEmail(rows: IndexRow[]) {
  const sorted = [...rows].sort((left, right) => left[2].localeCompare(right[2]) || left[1].localeCompare(right[1]));
  const companies = [...new Set(sorted.map((row) => row[2]))].join(", ");
  const posted = (row: IndexRow) => (row[6] ? row[6].slice(0, 10) : "date not given");
  return {
    subject: `${rows.length} new ${rows.length === 1 ? "role" : "roles"} at ${companies}`,
    text: sorted.map((row) => `${row[1]}\n${row[2]} · ${row[4]} · posted ${posted(row)}\n${row[5]}`).join("\n\n"),
    html: `<p>New roles at Nordstrom, Shopify and Starbucks, remote or in Washington:</p><ul>${sorted.map((row) =>
      `<li style="margin-bottom:10px"><a href="${escape(row[5])}">${escape(row[1])}</a><br>${escape(row[2])} · ${escape(row[4])} · posted ${posted(row)}</li>`).join("")}</ul>`,
  };
}

/** Sends through Amazon SES with the AWS CLI, which GitHub's runners and this laptop both have. */
export function sendAlert(rows: IndexRow[], { from, to, region }: { from: string; to: string[]; region: string }) {
  const { subject, text, html } = alertEmail(rows);
  const input = {
    FromEmailAddress: from,
    Destination: { ToAddresses: to },
    Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } } },
  };
  execFileSync("aws", ["sesv2", "send-email", "--region", region, "--cli-input-json", JSON.stringify(input)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}
