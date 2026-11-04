import { boardPath, readStored } from "@/features/jobs/board-store";
import { judgeData, labelSide, summarizeCorrections } from "@/features/jobs/judge";
import { rowKey } from "@/features/jobs/search-model";
import type { Board } from "@/features/jobs/service";
import { escapeHtml as escape, isSignedIn, reviewPage } from "@/features/outreach/session";

export const dynamic = "force-dynamic";

// GPT-6 Luna on the Decisions API: input tokens only, no charge for output.
const dollarsPerMillionTokens = 0.1;

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

const table = (headers: string[], rows: Array<Array<string | number>>) => rows.length === 0
  ? "<p><small>Nothing yet.</small></p>"
  : `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${
    rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;

export async function GET(request: Request) {
  if (!isSignedIn(request)) return Response.redirect(new URL("/outreach", request.url), 303);
  const [{ judged, corrections, stats, remaining }, board] = await Promise.all([judgeData(), readStored<Board>(boardPath)]);

  const rows = new Map((board?.rows ?? []).map((row) => [rowKey({ boardToken: row[3], id: row[0] }), row]));
  const scored = Object.entries(judged).filter(([, label]) => label);
  const refused = Object.keys(judged).length - scored.length;
  const { overruled, wrongPage } = summarizeCorrections(judged, corrections);

  const onBoard = scored.flatMap(([key, label]) => (rows.has(key) ? [{ row: rows.get(key)!, label }] : []));
  const resolved = onBoard.filter(({ row }) => row[8] === "Needs Review").length;
  const changedSide = onBoard.filter(({ row, label }) => (
    row[8] !== "Needs Review" && labelSide(row[9] ?? row[8]) !== labelSide(label)
  )).length;

  const perLabel = new Map<string, { scored: number; overruled: number }>();
  for (const [, label] of scored) {
    const entry = perLabel.get(label) ?? { scored: 0, overruled: 0 };
    perLabel.set(label, { ...entry, scored: entry.scored + 1 });
  }
  for (const { judge } of overruled) {
    const entry = perLabel.get(judge) ?? { scored: 0, overruled: 0 };
    perLabel.set(judge, { ...entry, overruled: entry.overruled + 1 });
  }

  const confusions = new Map<string, number>();
  for (const { judge, owner } of overruled) {
    confusions.set(`${judge} → ${owner}`, (confusions.get(`${judge} → ${owner}`) ?? 0) + 1);
  }

  const confidences = Object.values(stats.confidence);
  const unsure = Object.entries(stats.confidence)
    .filter(([key]) => !(key in corrections) && rows.has(key))
    .sort((left, right) => left[1] - right[1])
    .slice(0, 20);
  const tokens = stats.runs.reduce((sum, run) => sum + run.tokens, 0);
  const failed = stats.runs.reduce((sum, run) => sum + run.failed, 0);

  return reviewPage(`<p><a href="/">← Board</a> · <a href="/outreach">Outreach</a></p>
<h1>Judge report</h1>
<p><small>Accuracy is only known for what you correct: a role you never flagged is not proof it was right.</small></p>
<h2>At a glance</h2>
${table(["Measure", "Value"], [
    ["Postings scored", scored.length.toLocaleString("en-US")],
    ["Waiting for your next visit", remaining.toLocaleString("en-US")],
    ["Refused by the model", refused],
    ["Your corrections", Object.keys(corrections).length],
    ["Judge overruled by you", `${overruled.length} (${percent(overruled.length, scored.length)} of everything scored)`],
    ["Overruled and on the wrong page", wrongPage],
    ["Unclassified titles it resolved", resolved.toLocaleString("en-US")],
    ["Moved tech ↔ non-tech against the title rules", changedSide.toLocaleString("en-US")],
    ["Average confidence", confidences.length ? percent(confidences.reduce((sum, value) => sum + value, 0), confidences.length) : "– (recorded from the next run)"],
    ["Scored below 60% confidence", confidences.length ? `${confidences.filter((value) => value < 0.6).length} (${percent(confidences.filter((value) => value < 0.6).length, confidences.length)})` : "–"],
    ["Spend tracked", `$${((tokens * dollarsPerMillionTokens) / 1e6).toFixed(2)} over ${stats.runs.length} batches, plus about $0.23 for the first run`],
    ["Failed calls, retried next visit", failed],
  ])}
<h2>Most common mistakes</h2>
${table(["Judge said → you said", "Times"], [...confusions].sort((left, right) => right[1] - left[1]).map(([pair, count]) => [escape(pair), count]))}
<h2>Least sure: worth checking first</h2>
${table(["Confidence", "Judge said", "Role"], unsure.map(([key, value]) => {
    const row = rows.get(key)!;
    return [percent(value, 1), escape(judged[key] ?? ""), `<a href="${escape(row[5])}" target="_blank" rel="noreferrer">${escape(row[1])}</a> <small>${escape(row[2])}</small>`];
  }))}
<h2>By label</h2>
${table(["Label", "Page", "Scored", "Overruled", "Overruled rate"], [...perLabel]
    .sort((left, right) => right[1].scored - left[1].scored)
    .map(([label, { scored: count, overruled: wrong }]) => [escape(label), labelSide(label), count, wrong, percent(wrong, count)]))}
<h2>Your latest corrections</h2>
${table(["Role", "Judge said", "You said"], overruled.slice(-20).reverse().map(({ title, company, judge, owner }) => [
    `${escape(title)} <small>${escape(company)}</small>`, escape(judge), escape(owner),
  ]))}
<h2>Latest batches</h2>
${table(["Started (UTC)", "Scored", "Failed", "Tokens", "Seconds"], stats.runs.slice(-15).reverse().map((run) => [
    run.at.slice(0, 16).replace("T", " "), run.judged, run.failed, run.tokens.toLocaleString("en-US"), run.seconds,
  ]))}`);
}
