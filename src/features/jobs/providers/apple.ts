import boards from "../../../../data/apple-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type AppleBoard = GreenhouseBoard & {
  searchUrl: string;
};

export const appleBoards = boards as AppleBoard[];

export type AppleLocation = {
  name?: string;
  city?: string;
  stateProvince?: string;
  countryName?: string;
};

export type AppleSearchResult = {
  positionId?: string | number;
  reqId?: string;
  postingTitle?: string;
  transformedPostingTitle?: string;
  locations?: AppleLocation[];
  postDateInGMT?: string;
  postingDate?: string;
  jobSummary?: string;
  team?: { teamName?: string };
};

export type ParsedAppleJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
};

const browserHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

/**
 * Renders one `locations[]` entry as "City, State, Country". The search page
 * usually fills in `city` alone (state and country come back empty), so the
 * country is appended from the USA filter we searched with — without it the
 * downstream country filter cannot tell "Cupertino" apart from a non-US city.
 */
export function formatAppleLocation(locations: AppleLocation[] | undefined) {
  const first = Array.isArray(locations) ? locations[0] : undefined;
  if (!first) {
    return "Not listed";
  }

  const country = (first.countryName || "United States")
    .trim()
    .replace(/^United States of America$/iu, "United States");

  const parts = [first.city || first.name || "", first.stateProvince || "", country]
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)].join(", ") || "Not listed";
}

/**
 * Apple's search page is server-rendered: the React Router loader data is
 * inlined as `window.__staticRouterHydrationData = JSON.parse("<json>")`, so
 * one HTML GET yields a full page of postings with no token exchange. The
 * `/api/v1/role/search` endpoint this replaced answers 401 to every
 * unauthenticated caller, and the older `/api/csrfToken` route is gone.
 */
export function parseAppleHydrationData(html: string): ParsedAppleJob[] {
  const literal = html.match(
    /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(("[\s\S]*?[^\\]")\);/u,
  )?.[1];
  if (!literal) {
    return [];
  }

  let results: unknown;
  try {
    // The argument is a JS string literal holding the JSON document: unwrap
    // the literal first, then parse what it contained.
    results = (
      JSON.parse(JSON.parse(literal) as string) as {
        loaderData?: { search?: { searchResults?: unknown } };
      }
    )?.loaderData?.search?.searchResults;
  } catch {
    return [];
  }
  if (!Array.isArray(results)) {
    return [];
  }

  const jobs: ParsedAppleJob[] = [];
  for (const result of results as AppleSearchResult[]) {
    const title =
      typeof result.postingTitle === "string" ? result.postingTitle.trim() : "";
    const id = result.positionId ?? result.reqId ?? "";
    if (!title || !id) continue;

    const slug =
      typeof result.transformedPostingTitle === "string"
        ? `/${result.transformedPostingTitle}`
        : "";

    const postedAt = Date.parse(result.postDateInGMT ?? result.postingDate ?? "");

    jobs.push({
      id: String(id),
      title,
      location: formatAppleLocation(result.locations),
      absoluteUrl: `https://jobs.apple.com/en-us/details/${id}${slug}`,
      contentText: [result.team?.teamName, result.jobSummary]
        .filter((part): part is string => typeof part === "string" && Boolean(part))
        .join(". "),
      postedAt: Number.isNaN(postedAt) ? null : new Date(postedAt).toISOString(),
    });
  }

  return jobs;
}

/**
 * Walks the US search results newest-first, 20 postings per page. Apple
 * reports ~4.5k US openings, so `maxJobs` is what actually bounds the crawl.
 */
export async function fetchLatestAppleJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 300 } = options;
  const board = appleBoards[0];
  const pageSize = 20;
  const jobs: GreenhouseJob[] = [];
  // Wall-clock budget inside the caller's 20s provider timeout: a slow
  // window stops paging and keeps the postings already collected.
  const startedAt = Date.now();
  const runDeadlineMs = 16_000;

  for (let page = 1; page <= Math.ceil(maxJobs / pageSize); page += 1) {
    if (Date.now() - startedAt > runDeadlineMs) {
      break;
    }

    const url = `${board.searchUrl}&page=${page}`;

    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
        headers: browserHeaders,
      });
    } catch {
      break;
    }
    if (!response.ok) {
      break;
    }

    const parsed = parseAppleHydrationData(await response.text());
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
