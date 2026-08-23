import boards from "../../../../data/apple-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export const appleBoards = boards as GreenhouseBoard[];

export type AppleSearchResult = {
  positionId?: string | number;
  postingTitle?: string;
  location?: string;
  postingDate?: number | string;
  transformedPostingUrl?: string;
  canonicalUrl?: string;
  jobDescription?: string;
};

export type ParsedAppleJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
};

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

/**
 * Normalizes one `/api/v1/role/search` response (searchResults[] with
 * positionId / postingTitle / location / postingDate).
 */
export function parseAppleSearchResults(json: unknown): ParsedAppleJob[] {
  const results = (json as { searchResults?: unknown } | null)?.searchResults;
  if (!Array.isArray(results)) {
    return [];
  }

  const jobs: ParsedAppleJob[] = [];
  for (const result of results as AppleSearchResult[]) {
    const title = typeof result.postingTitle === "string" ? result.postingTitle.trim() : "";
    if (!title) continue;

    const id = result.positionId ?? result.canonicalUrl ?? "";
    if (!id) continue;

    let absoluteUrl = "";
    if (
      typeof result.transformedPostingUrl === "string" &&
      /^https:\/\//u.test(result.transformedPostingUrl)
    ) {
      absoluteUrl = result.transformedPostingUrl;
    } else {
      absoluteUrl = `https://jobs.apple.com/en-us/details/${id}`;
    }

    let postedAt: string | null = null;
    if (typeof result.postingDate === "number") {
      const date = new Date(result.postingDate);
      postedAt = Number.isNaN(date.getTime()) ? null : date.toISOString();
    } else if (typeof result.postingDate === "string") {
      const timestamp = Date.parse(result.postingDate);
      postedAt = Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
    }

    jobs.push({
      id: String(id),
      title,
      location:
        typeof result.location === "string" && result.location.trim()
          ? result.location.trim()
          : "Not listed",
      absoluteUrl,
      contentText: stripHtml(result.jobDescription),
      postedAt,
    });
  }

  return jobs;
}

/**
 * Apple's jobs search API: POST /api/v1/role/search with the locale and a
 * US location filter. Paginated with `page`; the response exposes
 * searchResults + totalRecords.
 */
export async function fetchLatestAppleJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 150 } = options;
  const board = appleBoards[0];
  const pageSize = 25;
  const jobs: GreenhouseJob[] = [];

  for (let page = 1; page <= Math.ceil(maxJobs / pageSize); page += 1) {
    let response: Response;
    try {
      response = await fetch(board.apiUrl, {
        method: "POST",
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          origin: "https://jobs.apple.com",
          referer: "https://jobs.apple.com/en-us/search",
        },
        body: JSON.stringify({
          query: "",
          locale: "en-us",
          filters: { postingpostLocation: ["postLocation-USA"] },
          page,
        }),
      });
    } catch {
      break;
    }
    if (!response.ok) {
      break;
    }

    const parsed = parseAppleSearchResults(await response.json());
    if (parsed.length === 0) {
      break;
    }

    jobs.push(
      ...parsed.map((job) => ({
        ...job,
        company: board.company,
        boardToken: board.token,
        updatedAt: null,
      })),
    );

    if (parsed.length < pageSize || jobs.length >= maxJobs) {
      break;
    }
  }

  return jobs;
}
