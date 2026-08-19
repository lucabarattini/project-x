import boards from "../../../../data/ashby-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type AshbyApiJob = {
  id?: string;
  title?: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  publishedAt?: string | null;
  isListed?: boolean;
  isRemote?: boolean | null;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

type AshbyApiResponse = {
  jobs?: AshbyApiJob[];
};

type FetchAshbyJobsOptions = {
  limit?: number;
};

export const ashbyBoards = boards as GreenhouseBoard[];

export function stripAshbyHtml(html = "") {
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

export async function fetchLatestAshbyJobs(options: FetchAshbyJobsOptions = {}) {
  const { limit } = options;
  const results = await mapWithConcurrency(ashbyBoards, 6, async (board) => {
    try {
      const response = await fetch(board.apiUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) {
        throw new Error(`${board.company} returned ${response.status}`);
      }

      const data = (await response.json()) as AshbyApiResponse;

      return (data.jobs ?? [])
        .filter((job) => job.isListed !== false)
        .map((job): GreenhouseJob | null => {
          if (!job.id && !job.jobUrl) {
            return null;
          }

          const description = job.descriptionPlain || stripAshbyHtml(job.descriptionHtml);

          return {
            id: job.id ?? job.jobUrl ?? `${board.token}-${job.title}`,
            title: job.title || "Untitled",
            company: board.company,
            boardToken: board.token,
            location: job.location || (job.isRemote ? "Remote" : "Not listed"),
            absoluteUrl: job.jobUrl || job.applyUrl || board.boardUrl,
            contentText: [
              job.department,
              job.team,
              job.employmentType,
              description,
            ]
              .filter(Boolean)
              .join(" "),
            postedAt: job.publishedAt ?? null,
            updatedAt: null,
          };
        })
        .filter((job): job is GreenhouseJob => job !== null);
    } catch {
      return [];
    }
  });

  const sortedJobs = results.flat().sort((a, b) => {
    const left = a.postedAt ? Date.parse(a.postedAt) : 0;
    const right = b.postedAt ? Date.parse(b.postedAt) : 0;
    return right - left;
  });

  return typeof limit === "number" ? sortedJobs.slice(0, limit) : sortedJobs;
}
