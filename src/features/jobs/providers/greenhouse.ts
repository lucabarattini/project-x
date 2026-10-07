import boards from "../../../../data/greenhouse-boards.json";
import { collectBoardResults, readBoards } from "./concurrency";
import jobUrlOverrides from "../../../../data/job-url-overrides.json";

export type GreenhouseBoard = {
  company: string;
  token: string;
  source: string;
  boardUrl: string;
  apiUrl: string;
  lastVerifiedJobCount: number;
};

export type GreenhouseJob = {
  id: number | string;
  title: string;
  company: string;
  boardToken: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
  updatedAt: string | null;
};

type GreenhouseApiJob = {
  id: number;
  title: string;
  absolute_url: string;
  content?: string;
  first_published?: string;
  updated_at?: string;
  location?: {
    name?: string;
  };
};

type GreenhouseApiResponse = {
  jobs?: GreenhouseApiJob[];
};

type FetchGreenhouseJobsOptions = {
  limit?: number;
  detailLimit?: number;
};

export const greenhouseBoards = boards as GreenhouseBoard[];

type JobUrlOverride = {
  provider: "greenhouse";
  boardToken: string;
  jobId: string;
  canonicalUrl: string;
  evidenceUrl: string;
  verifiedAt: string;
};

const canonicalJobUrls = new Map(
  (jobUrlOverrides as JobUrlOverride[]).map((override) => [
    `${override.provider}:${override.boardToken}:${override.jobId}`,
    override.canonicalUrl,
  ]),
);

export function resolveGreenhouseJobUrl(
  boardToken: string,
  jobId: number | string,
  providerUrl: string,
) {
  return canonicalJobUrls.get(`greenhouse:${boardToken}:${jobId}`) ?? providerUrl;
}

function stripHtml(html = "") {
  // `content=true` board lists return the description entity-escaped
  // ("&lt;h2&gt;Minimum requirements&lt;/h2&gt;"). Unescaping the tags first
  // lets the block breaks below survive; without it the section headings ran
  // together and every minimum read as a preferred qualification.
  return html
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<li[^>]*>/giu, " - ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(p|div|section|h2|h3|ul|ol)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

async function fetchJobContent(boardToken: string, jobId: number) {
  try {
    const response = await fetch(
      `https://job-boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) },
    );

    if (!response.ok) {
      return "";
    }

    return stripHtml(await response.text());
  } catch {
    return "";
  }
}

/**
 * Enriches job descriptions in parallel and stops when the run deadline is
 * near, so a slow Greenhouse never eats the whole provider budget. Jobs that
 * don't get a detail page keep their board-list description. Returns partial
 * results instead of letting the source report "unavailable" on a slow window.
 */
async function fetchJobDetailsWithinDeadline(
  jobs: GreenhouseJob[],
  startedAt: number,
  deadlineMs: number,
) {
  const detailed: GreenhouseJob[] = [];
  let index = 0;

  // Lower concurrency in serverless so the burst of embed-page requests is
  // less likely to trip Greenhouse's datacenter-IP rate limiter.
  const workerCount = process.env.VERCEL === "1" ? 8 : 12;

  async function worker() {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      if (Date.now() - startedAt > deadlineMs) {
        detailed.push(current);
        continue;
      }
      const contentText = await fetchJobContent(current.boardToken, Number(current.id));
      detailed.push({ ...current, contentText });
    }
  }

  await Promise.all(Array.from({ length: Math.min(workerCount, jobs.length) }, worker));
  return detailed;
}

export async function fetchLatestGreenhouseJobs(
  options: FetchGreenhouseJobsOptions = {},
) {
  const { limit, detailLimit = 120 } = options;
  // Wall-clock budget for the whole run, inside the caller's 100 s provider
  // timeout. The boards fan-out and the per-job detail enrichment both
  // degrade to partial results past this deadline.
  const startedAt = Date.now();
  const runDeadlineMs = 90_000;

  // Lower board concurrency in serverless to shrink the simultaneous-request
  // burst that datacenter IPs get rate-limited on.
  const boardConcurrency = process.env.VERCEL === "1" ? 8 : 12;

  const results = await readBoards(greenhouseBoards, boardConcurrency, 20_000, 75_000, async (board, timeoutMs) => {
      const response = await fetch(board.apiUrl, {
        // With `content=true` a large board (Stripe, Anthropic) is 5-9 MB,
        // past the 2 MB the Next.js fetch cache will store; the snapshot is
        // what gets cached, so the raw list is not.
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`${board.company} returned ${response.status}`);
      }

      const data = (await response.json()) as GreenhouseApiResponse;

      return (data.jobs ?? []).map((job) => ({
        id: job.id,
        title: job.title,
        company: board.company,
        boardToken: board.token,
        location: job.location?.name ?? "Not listed",
        absoluteUrl: resolveGreenhouseJobUrl(board.token, job.id, job.absolute_url),
        contentText: stripHtml(job.content),
        postedAt: job.first_published ?? null,
        updatedAt: job.updated_at ?? null,
      }));
  });

  const sortedJobs = collectBoardResults("greenhouse", results).sort((a, b) => {
    const left = a.postedAt ? Date.parse(a.postedAt) : 0;
    const right = b.postedAt ? Date.parse(b.postedAt) : 0;
    return right - left;
  });

  const latestJobs = typeof limit === "number" ? sortedJobs.slice(0, limit) : sortedJobs;

  // Board lists are fetched with `content=true`, so nearly every posting
  // already carries its description. Only the ones that came back empty need
  // the per-job embed page; spending the detail budget on the newest postings
  // regardless left everything past the first ~120 with no experience line.
  const missingContent = latestJobs.filter((job) => !job.contentText);
  const withContent = latestJobs.filter((job) => job.contentText);
  const resolvedDetailLimit = Math.min(missingContent.length, detailLimit);
  const detailedJobs = await fetchJobDetailsWithinDeadline(
    missingContent.slice(0, resolvedDetailLimit),
    startedAt,
    runDeadlineMs,
  );

  return [...withContent, ...detailedJobs, ...missingContent.slice(resolvedDetailLimit)];
}
