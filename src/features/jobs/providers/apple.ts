import boards from "../../../../data/apple-boards.json";
import { mapWithinDeadline, pageConcurrency } from "./concurrency";
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
 * Apple Store floor staff. Apple's careers board prefixes every US retail
 * posting with "US-" or "US - " — "US-Genius", "US - Specialist: Seasonal,
 * Part-time", "US-Store Leader" — and republishes the same handful of titles
 * per market, constantly. Sorted newest-first, which is how this provider
 * reads the board, they were about 6% of Apple's page-one postings.
 *
 * They used to be classified into a track no portal lists, which kept them
 * out of the default views but still in the snapshot, the JSON feed, the CSV
 * and the track picker. They are now dropped here, at parse time, so a
 * shop-floor posting never becomes a job at all.
 *
 * The prefix alone is not the test, and neither is the word after it.
 * "Specialist" by itself is a real Apple engineering title — "Specialist,
 * Emergency Services - Sensing & Connectivity" was posted eight times in the
 * same sample — so the store vocabulary has to sit behind the prefix. And the
 * vocabulary has to be the whole title: a store posting is "US-Lead", while
 * "US - Lead Software Engineer" would be an engineering one, which is why the
 * match ends at the title's end or its first separator. Every name in the
 * list was read off the board; a variant that is missed costs one visible
 * posting, while a wrong match hides a real role.
 */
const appleRetailStoreTitle =
  /^\s*US\s*[-–—]\s*(?:(?:senior|sr\.?)\s+)?(?:technical\s+(?:specialist|expert)|operations\s+(?:expert|specialist|lead(?:er)?)|business\s+(?:pro|expert)|creative\s+pro|(?:store|market)\s+lead(?:er)?|specialist|expert|genius|creative|manager|lead(?:er)?)\s*(?=$|[:,(])/iu;

export function isAppleRetailStoreTitle(title: string) {
  return appleRetailStoreTitle.test(title);
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
    if (isAppleRetailStoreTitle(title)) continue;

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
 * Reads `totalRecords` out of the same hydration blob. Page one reports how
 * many US openings exist, which is what lets the remaining pages be fetched
 * in parallel instead of discovered one redirect at a time.
 */
export function parseAppleTotalRecords(html: string): number {
  const literal = html.match(
    /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(("[\s\S]*?[^\\]")\);/u,
  )?.[1];
  if (!literal) {
    return 0;
  }

  try {
    const total = (
      JSON.parse(JSON.parse(literal) as string) as {
        loaderData?: { search?: { totalRecords?: unknown } };
      }
    )?.loaderData?.search?.totalRecords;
    return typeof total === "number" && total > 0 ? total : 0;
  } catch {
    return 0;
  }
}

/**
 * Walks the US search results newest-first, 20 postings per page. Apple
 * reports ~4.5k US openings; page one gives the total, then the remaining
 * pages are fetched in parallel, which is the difference between covering
 * a few hundred roles and covering the board.
 */
export async function fetchLatestAppleJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 4600 } = options;
  const board = appleBoards[0];
  const pageSize = 20;
  // Wall-clock budget inside the caller's provider timeout: a slow window
  // stops paging and keeps the postings already collected.
  const startedAt = Date.now();
  const runDeadlineMs = 42_000;

  const pageUrl = (page: number) => `${board.searchUrl}&page=${page}`;

  async function readPage(url: string) {
    try {
      const response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(12_000),
        headers: browserHeaders,
      });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  }

  // Page one decides whether this run is trustworthy at all. Both failures
  // below used to `return []`, which runProvider reports as "no openings" —
  // the board rendered as a quiet day on the dashboard while Apple was in
  // fact refusing us, and the empty result was cached for a full TTL.
  // Neither case is a quiet day: this board carries ~4.5k US openings, so
  // zero of them means we were blocked or the page shape moved under us.
  const firstPage = await readPage(pageUrl(1));
  if (firstPage === null) {
    throw new Error("Apple search page one could not be read");
  }

  const parsed = parseAppleHydrationData(firstPage);
  if (parsed.length === 0) {
    throw new Error("Apple search page one carried no postings");
  }

  const total = Math.min(parseAppleTotalRecords(firstPage) || parsed.length, maxJobs);
  const remainingPages = Array.from(
    { length: Math.max(0, Math.ceil(total / pageSize) - 1) },
    (_, index) => index + 2,
  );

  const rest = await mapWithinDeadline(
    remainingPages,
    pageConcurrency,
    startedAt,
    runDeadlineMs,
    async (page) => parseAppleHydrationData(await readPage(pageUrl(page)) ?? ""),
  );

  return [...parsed, ...rest.flat()]
    .slice(0, maxJobs)
    .map((job) => ({
      ...job,
      company: board.company,
      boardToken: board.token,
      updatedAt: null,
    })) satisfies GreenhouseJob[];
}
