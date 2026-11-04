import { correctionsPath, judgeWindowMs, labelsPath, readStored, recentPath, writeStored } from "./board-store";
import { judgeLabels } from "./display";
import { mapWithinDeadline } from "./providers/concurrency";
import type { RecentPosting } from "./service";

const instructions = `Pick the one label that fits this job posting.
A role is technical when the work needs engineering, software, data or hardware skills, or directly runs that work.
Technical Program Managers, Solutions Engineers, Sales Engineers and Data Analysts are always technical.
Business roles that only work near technology, such as product marketing, finance or recruiting, are not technical.`;

// The model weighs these more than the instructions: without them it filed
// Solutions Engineers and Sales Engineering Managers under sales.
const notes: Record<string, string> = {
  "Forward Deployed": "Forward deployed, solutions, sales and customer engineers, and their managers.",
  "Technical Program Management": "Technical and engineering program managers.",
  "Analytics & Business Intelligence": "Data analysts, product analysts and business intelligence.",
  "Sales & Partnerships": "Sellers, account and partnership roles. Never solutions or sales engineers.",
};

const choices = judgeLabels.map((value) => ({ value, description: notes[value] }));

/** Each example costs about 15 tokens on every posting, so only the newest ones ride along. */
const maxExamples = 20;

type Labels = Record<string, string>;
type Correction = { title: string; company: string; label: string };
type Corrections = Record<string, Correction>;

/** The judge's prompt: the rules, then the owner's latest corrections as examples. */
export function judgeInstructions(corrections: Corrections) {
  const examples = Object.values(corrections).slice(-maxExamples)
    .map(({ title, company, label }) => `"${title}" at ${company}: ${label}`);
  if (examples.length === 0) return instructions;
  return `${instructions}\n\nThe owner corrected these earlier labels. Label similar roles the same way:\n${examples.join("\n")}`;
}

async function readAll() {
  const [labels, corrections] = await Promise.all([
    readStored<Labels>(labelsPath),
    readStored<Corrections>(correctionsPath),
  ]);
  const saved = corrections ?? {};
  // A correction always wins, and lives in its own file so a judge batch
  // finishing at the same moment cannot overwrite it.
  const merged = { ...labels, ...Object.fromEntries(Object.entries(saved).map(([key, { label }]) => [key, label])) };
  return { stored: labels ?? {}, merged, corrections: saved };
}

async function unjudged(labels: Labels) {
  const oldest = Date.now() - judgeWindowMs;
  const recent = await readStored<RecentPosting[]>(recentPath) ?? [];
  return recent.filter((posting) => !(posting.key in labels) && Date.parse(posting.postedAt) >= oldest);
}

async function decide(posting: RecentPosting, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: `${posting.title} at ${posting.company}, ${posting.location}\n\n${posting.text}`,
      questions: [{ type: "choice", name: "label", instructions: prompt, choices }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const { answers } = await response.json() as { answers: Array<{ type: string; choice?: string }> };
  // A refusal is stored as "" so the posting keeps its title rule and is not asked again.
  return answers[0]?.choice ?? "";
}

/** The labels so far, and how many postings still wait. Without a key nothing waits. */
export async function judgeStatus() {
  const { merged } = await readAll();
  const remaining = process.env.OPENAI_API_KEY ? (await unjudged(merged)).length : 0;
  return { labels: merged, remaining };
}

/**
 * Judges the next batch. Only postings on the board can be judged, and each
 * only once, so calling this repeatedly cannot run up the OpenAI bill.
 */
export async function judgeNext() {
  const { stored, merged, corrections } = await readAll();
  const waiting = await unjudged(merged);
  const prompt = judgeInstructions(corrections);
  const judged: Labels = {};
  await mapWithinDeadline(waiting.slice(0, 300), 30, Date.now(), 45_000, async (posting) => {
    const label = await decide(posting, prompt).catch(() => null);
    if (label !== null) judged[posting.key] = label;
  });
  await writeStored(labelsPath, { ...stored, ...judged });
  return { labels: judged, remaining: waiting.length - Object.keys(judged).length };
}

/** Saves the owner's label for one posting; it also teaches the judge from then on. */
export async function correctLabel(key: string, correction: Correction) {
  const corrections = await readStored<Corrections>(correctionsPath) ?? {};
  await writeStored(correctionsPath, { ...corrections, [key]: correction });
}
