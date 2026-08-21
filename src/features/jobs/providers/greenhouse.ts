import boards from "../../../../data/greenhouse-boards.json";
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
  return html
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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

  await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, worker));
  return detailed;
}

export async function fetchLatestGreenhouseJobs(
  options: FetchGreenhouseJobsOptions = {},
) {
  const { limit, detailLimit = 120 } = options;
  // Hard wall-clock budget for the whole run, comfortably inside the caller's
  // 30s provider timeout. The boards fan-out (41 boards) and the per-job
  // detail enrichment both degrade to partial results past this deadline.
  const startedAt = Date.now();
  const runDeadlineMs = 24_000;

  const results = await mapWithConcurrency(greenhouseBoards, 12, async (board) => {
    try {
      const response = await fetch(board.apiUrl, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(5_000),
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
    } catch {
      return [];
    }
  });

  const sortedJobs = results.flat().sort((a, b) => {
    const left = a.postedAt ? Date.parse(a.postedAt) : 0;
    const right = b.postedAt ? Date.parse(b.postedAt) : 0;
    return right - left;
  });

  const latestJobs = typeof limit === "number" ? sortedJobs.slice(0, limit) : sortedJobs;
  const resolvedDetailLimit = Math.min(latestJobs.length, detailLimit);
  const detailedJobs = await fetchJobDetailsWithinDeadline(
    latestJobs.slice(0, resolvedDetailLimit),
    startedAt,
    runDeadlineMs,
  );

  return [...detailedJobs, ...latestJobs.slice(resolvedDetailLimit)];
}
