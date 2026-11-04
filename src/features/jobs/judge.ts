import { judgeWindowMs, labelsPath, readStored, recentPath, writeStored } from "./board-store";
import { nonTechnicalFamilyOptions, technicalTrackOptions } from "./display";
import { mapWithinDeadline } from "./providers/concurrency";
import type { RecentPosting } from "./service";

const instructions = `Pick the one label that fits this job posting.
A role is technical when the work needs engineering, software, data or hardware skills, or directly runs that work.
Technical Program Managers, Solutions Engineers, Sales Engineers and Data Analysts are always technical.
Business roles that only work near technology, such as product marketing, finance or recruiting, are not technical.`;

const choices = [...technicalTrackOptions(), ...nonTechnicalFamilyOptions]
  .filter((label) => label !== "Operations & Support" && label !== "Non-Technical")
  .map((value) => ({ value }));

type Labels = Record<string, string>;

async function unjudged(labels: Labels) {
  const oldest = Date.now() - judgeWindowMs;
  const recent = await readStored<RecentPosting[]>(recentPath) ?? [];
  return recent.filter((posting) => !(posting.key in labels) && Date.parse(posting.postedAt) >= oldest);
}

async function decide(posting: RecentPosting) {
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
      questions: [{ type: "choice", name: "label", instructions, choices }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const { answers } = await response.json() as { answers: Array<{ type: string; choice?: string }> };
  // A refusal is stored as "" so the posting keeps its title rule and is not asked again.
  return answers[0]?.choice ?? "";
}

/** The labels so far, and how many postings still wait. Without a key nothing waits. */
export async function judgeStatus() {
  const labels = await readStored<Labels>(labelsPath) ?? {};
  const remaining = process.env.OPENAI_API_KEY ? (await unjudged(labels)).length : 0;
  return { labels, remaining };
}

/**
 * Judges the next batch. Only postings on the board can be judged, and each
 * only once, so calling this repeatedly cannot run up the OpenAI bill.
 */
export async function judgeNext() {
  const labels = await readStored<Labels>(labelsPath) ?? {};
  const waiting = await unjudged(labels);
  const batch = waiting.slice(0, 200);
  const judged: Labels = {};
  await mapWithinDeadline(batch, 20, Date.now(), 45_000, async (posting) => {
    const label = await decide(posting).catch(() => null);
    if (label !== null) judged[posting.key] = label;
  });
  await writeStored(labelsPath, { ...labels, ...judged });
  return { labels: judged, remaining: waiting.length - Object.keys(judged).length };
}
