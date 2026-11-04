import { boardPath, readStored } from "@/features/jobs/board-store";
import { judgeData, labelSide, summarizeCorrections } from "@/features/jobs/judge";
import { rowKey, type IndexRow } from "@/features/jobs/search-model";
import type { Board } from "@/features/jobs/service";
import { escapeHtml as escape, isSignedIn, reviewPage } from "@/features/outreach/session";
import { chartStyles, colors, heatmap, horizontalBars, intervals, legend, stackedColumns, waiting, wilson } from "./charts";

export const dynamic = "force-dynamic";

// GPT-6 Luna on the Decisions API: input tokens only, no charge for output.
const dollarsPerMillionTokens = 0.1;
const firstRunDollars = 0.23;
const budgetDollars = 15;

type Side = keyof typeof colors;
const sides: Array<[Side, string]> = [["tech", "Tech"], ["non-tech", "Non-tech"], ["neither", "Neither"]];
const sideLegend = legend(sides.map(([side, name]) => [name, colors[side]]));

/** What the title rules alone said about a posting. */
function ruleVerdict(row: IndexRow) {
  const [category, family] = [row[8], row[9]];
  if (category === "Needs Review") return family && family !== "Other" ? "Unclassified, family guessed" : "Unclassified";
  if (category === "Manual & Field Operations") return "Manual";
  return family ? "Non-tech" : "Tech";
}
const ruleVerdicts = ["Tech", "Non-tech", "Manual", "Unclassified, family guessed", "Unclassified"];

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
  const spent = firstRunDollars + (tokens * dollarsPerMillionTokens) / 1e6;

  const matrix = ruleVerdicts.map((verdict) => sides.map(([side]) => (
    onBoard.filter(({ row, label }) => ruleVerdict(row) === verdict && labelSide(label) === side).length
  )));
  const agreed = (verdict: number, side: number) => percent(matrix[verdict][side], matrix[verdict].reduce((sum, value) => sum + value, 0));

  const days = new Map<string, Record<Side, number>>();
  for (const { row, label } of onBoard) {
    const day = (row[6] ?? "").slice(0, 10);
    const counts = days.get(day) ?? { tech: 0, "non-tech": 0, neither: 0 };
    counts[labelSide(label)] += 1;
    days.set(day, counts);
  }
  const lastDays = [...days].sort(([left], [right]) => left.localeCompare(right)).slice(-14);

  const techShare = onBoard.filter(({ label }) => labelSide(label) === "tech").length / Math.max(1, onBoard.length);
  const companies = new Map<string, { total: number; tech: number }>();
  for (const { row, label } of onBoard) {
    const entry = companies.get(row[2]) ?? { total: 0, tech: 0 };
    companies.set(row[2], { total: entry.total + 1, tech: entry.tech + (labelSide(label) === "tech" ? 1 : 0) });
  }
  const topCompanies = [...companies]
    .sort((left, right) => right[1].total - left[1].total)
    .slice(0, 15)
    .sort((left, right) => right[1].tech / right[1].total - left[1].tech / left[1].total)
    .map(([label, { total, tech }]) => ({ label, value: tech / total, ...wilson(tech, total), note: `${total} roles` }));

  const histogram = Array.from({ length: 10 }, (_, bin) => ({
    label: `${bin * 10}%`,
    parts: [{
      name: "Postings",
      color: colors.tech,
      value: confidences.filter((value) => Math.min(9, Math.floor(value * 10)) === bin).length,
    }],
  }));

  const overruledKeys = new Set(overruled.map(({ key }) => key));
  const calibration = [[0, 0.6], [0.6, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([low, high]) => {
    const inBand = Object.entries(stats.confidence).filter(([, value]) => value >= low && value < high);
    const wrong = inBand.filter(([key]) => overruledKeys.has(key)).length;
    return {
      label: `Confidence ${Math.round(low * 100)} to ${Math.min(100, Math.round(high * 100))}%`,
      value: inBand.length ? wrong / inBand.length : 0,
      ...wilson(wrong, inBand.length),
      note: `${wrong} of ${inBand.length}`,
    };
  });
  const calibrated = overruled.filter(({ key }) => key in stats.confidence).length;

  return reviewPage(`<p><a href="/">← Board</a> · <a href="/outreach">Outreach</a></p>
<h1>Judge report</h1>
<p><small>Accuracy is only known for what you correct: a role you never flagged is not proof it was right.</small></p>
${chartStyles}
<section><h2>Does it agree with the title rules?</h2>
<p>Agrees on ${agreed(0, 0)} of what the rules call tech and ${agreed(1, 1)} of what they call non-tech. Each row is what the rules said, each column what the judge said, shaded by the share of the row.</p>
${heatmap(ruleVerdicts, sides.map(([, name]) => `Judge: ${name}`), matrix)}</section>
<section><h2>Postings scored per day</h2>
<p>By the day each role was published. The dips are weekends.</p>
${sideLegend}${stackedColumns(lastDays.map(([day, counts]) => ({
    label: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    parts: sides.map(([side, name]) => ({ name, value: counts[side], color: colors[side] })),
  })))}</section>
<section><h2>Tech share by company</h2>
<p>The 15 companies with the most scored roles. Dots are the share, lines the 95% interval, so short lines are the ones to trust.</p>
${intervals(topCompanies, { value: techShare, label: `All: ${Math.round(techShare * 100)}%` })}</section>
<section><h2>Where each label sends a role</h2>
${sideLegend}${horizontalBars([...perLabel].sort((left, right) => right[1].scored - left[1].scored).map(([label, { scored: count }]) => ({
    label, value: count, color: colors[labelSide(label)],
  })))}</section>
<section><h2>How sure is it?</h2>
<p>Confidence per posting, recorded since this report was added.</p>
${confidences.length ? stackedColumns(histogram) : waiting("confidence is recorded from the next scored postings onward.")}</section>
<section><h2>Is its confidence honest?</h2>
<p>A well-calibrated judge is overruled less as confidence rises. Your corrections are not a random sample, so read this as a lower bound.</p>
${calibrated >= 5 ? intervals(calibration) : waiting(`needs at least 5 corrections on postings with a recorded confidence, ${calibrated} so far.`)}</section>
<section><h2>Budget</h2>
${horizontalBars([{ label: "OpenAI spend, estimated", value: spent, color: colors.tech, text: `$${spent.toFixed(2)} of $${budgetDollars}` }], budgetDollars)}</section>
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
    ["Spend, estimated", `$${spent.toFixed(2)} (${stats.runs.length} batches tracked, plus about $${firstRunDollars} for the first run)`],
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
