import boards from "../../../../data/microsoft-boards.json";
import { detailConcurrency, mapWithinDeadline, pageConcurrency } from "./concurrency";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

/**
 * Every Eightfold PCSX careers site, not only Microsoft's: Starbucks runs on
 * the same API. `excludeTitlePattern` drops postings that share the search
 * radius but belong to no portal — Starbucks' Seattle search is half store
 * shifts ("barista - Store# 03224").
 */
export type PcsxBoard = GreenhouseBoard & {
  excludeTitlePattern?: string;
};

export const microsoftBoards = boards as PcsxBoard[];

export type PcsxPosition = {
  id?: string | number;
  displayJobId?: string;
  atsJobId?: string;
  name?: string;
  locations?: string[];
  standardizedLocations?: string[];
  department?: string | null;
  workLocationOption?: string | null;
  postedTs?: number;
  creationTs?: number;
  positionUrl?: string;
};

export type ParsedPcsxJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
};

/**
 * Renders a posting's locations. Two traps in this payload:
 *
 * `locations` pads multi-site postings with the literal placeholder "United
 * States, Multiple Locations, Multiple Locations" and puts it FIRST, with the
 * real offices after it — the careers site renders exactly that, then hides the
 * rest behind a "+1 more" tooltip. Reading only `locations[0]` therefore showed
 * the placeholder and dropped every actual city.
 *
 * `standardizedLocations` carries the same list already normalized to
 * "Redmond, WA, US", which is both cleaner and what the country filter keys on,
 * so it is preferred; it degrades to a bare "US" for the padded entries.
 *
 * Placeholders are dropped whenever a real office survives, and a posting that
 * is genuinely US-wide reports "United States" rather than repeating itself.
 */
const placeholderLocation = /multiple locations|^\s*US\s*$|^\s*United States\s*$/iu;

export function formatPcsxLocation(
  locations: string[] | undefined,
  standardizedLocations?: string[],
) {
  const clean = (values: string[] | undefined) => (Array.isArray(values) ? values : [])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => [...new Set(
      value.split(",").map((segment) => segment.trim()).filter(Boolean),
    )].join(", "));

  const standardized = clean(standardizedLocations);
  const raw = clean(locations);

  const named = standardized.filter((value) => !placeholderLocation.test(value));
  const fallback = raw.filter((value) => !placeholderLocation.test(value));
  const preferred = named.length > 0 ? named : fallback;

  if (preferred.length > 0) {
    return [...new Set(preferred)].join(" · ");
  }

  // Only placeholders came back: the posting really is US-wide.
  return standardized.length > 0 || raw.length > 0 ? "United States" : "Not listed";
}

/**
 * Normalizes one `/api/pcsx/search` response. Positions carry `name`,
 * `locations[]`, epoch-seconds `postedTs`/`creationTs` and a site-relative
 * `positionUrl`.
 */
export function parsePcsxPositions(
  json: unknown,
  siteBaseUrl: string,
): ParsedPcsxJob[] {
  const positions = (json as { data?: { positions?: unknown } } | null)?.data?.positions;
  if (!Array.isArray(positions)) {
    return [];
  }

  const jobs: ParsedPcsxJob[] = [];
  for (const position of positions as PcsxPosition[]) {
    const title = typeof position.name === "string" ? position.name.trim() : "";
    const id = position.id ?? position.displayJobId ?? "";
    if (!title || !id) continue;

    const path =
      typeof position.positionUrl === "string" && position.positionUrl
        ? position.positionUrl
        : `/careers/job/${id}`;

    const timestamp = position.postedTs ?? position.creationTs;

    jobs.push({
      id: String(position.displayJobId ?? position.atsJobId ?? id),
      title,
      location: formatPcsxLocation(position.locations, position.standardizedLocations),
      absoluteUrl: new URL(path, siteBaseUrl).toString(),
      contentText: [position.department, position.workLocationOption]
        .filter((part): part is string => typeof part === "string" && Boolean(part))
        .join(" "),
      postedAt:
        typeof timestamp === "number" ? new Date(timestamp * 1000).toISOString() : null,
    });
  }

  return jobs;
}

/**
 * Plain text of a `/api/pcsx/position_details` response's `jobDescription`,
 * which is where the "N+ years of experience" line lives.
 */
export function parsePcsxDescription(json: unknown): string | null {
  const html = (json as { data?: { jobDescription?: unknown } } | null)?.data?.jobDescription;
  if (typeof html !== "string" || !html.trim()) return null;
  return html
    .replace(/<li[^>]*>/giu, " - ")
    .replace(/<\/(p|div|li|ul|ol|h\d)>|<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&rsquo;/giu, "'")
    .replace(/[ \t]+/gu, " ")
    .trim();
}

/**
 * Reads the reported result count, which page one uses to schedule the rest
 * of the pages in parallel rather than walking them ten rows at a time.
 */
export function parsePcsxCount(json: unknown): number {
  const count = (json as { data?: { count?: unknown } } | null)?.data?.count;
  return typeof count === "number" && count > 0 ? count : 0;
}

/**
 * Microsoft retired `gcsservices.careers.microsoft.com` (its hostname now
 * answers with a mismatched CDN certificate) and moved onto an Eightfold
 * PCSX site. `/api/pcsx/search` is one of the paths their robots.txt allows;
 * the older `/api/apply/v2/jobs` answers 403 "Not authorized for PCSX".
 * A page is capped at 10 rows server-side, so the ~1.1k US openings would take
 * ~110 calls. Microsoft rate-limits that per IP (429, then 403 for a cooldown
 * that outlives a single run), so the crawl is ordered newest-first via
 * `sort_by=timestamp` and bounded: a radar wants the recent end of the board,
 * and stopping at the first 429 keeps the next run's budget intact.
 */
export async function fetchLatestPcsxJobs(board: PcsxBoard) {
  const maxJobs = 600;
  // Each detail is one more request against Microsoft's per-IP throttle.
  const maxDetails = 120;
  const excluded = board.excludeTitlePattern
    ? new RegExp(board.excludeTitlePattern, "iu")
    : null;
  const pageSize = 10;
  const startedAt = Date.now();
  const runDeadlineMs = 26_000;

  let rateLimited = false;

  async function readPage(start: number) {
    if (rateLimited) {
      return null;
    }
    try {
      const response = await fetch(`${board.apiUrl}&start=${start}&num=${pageSize}`, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: "application/json",
          referer: board.boardUrl,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        },
      });
      // 429 is the throttle and 403 is the cooldown that follows it; both mean
      // every further page this run would be wasted.
      if (response.status === 429 || response.status === 403) {
        rateLimited = true;
        return null;
      }
      return response.ok ? ((await response.json()) as unknown) : null;
    } catch {
      return null;
    }
  }

  async function readDetail(positionId: string) {
    const url = new URL("/api/pcsx/position_details", board.apiUrl);
    url.searchParams.set("position_id", positionId);
    url.searchParams.set("domain", new URL(board.apiUrl).searchParams.get("domain") ?? "");
    url.searchParams.set("hl", "en");
    try {
      const response = await fetch(url, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "application/json",
          referer: board.boardUrl,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        },
      });
      if (response.status === 429 || response.status === 403) {
        rateLimited = true;
        return null;
      }
      if (!response.ok) return null;
      return parsePcsxDescription(await response.json());
    } catch {
      return null;
    }
  }

  // Page one decides whether this run is trustworthy at all. Both failures
  // below used to `return []`, which runProvider reports as "no openings" —
  // so the throttle this provider already detects (the 429/403 cooldown
  // above) reached the dashboard as a quiet day rather than an outage, and
  // the empty board was cached for a full TTL. This board carries ~1.1k US
  // openings; zero of them is never the real answer.
  const firstPage = await readPage(0);
  if (firstPage === null) {
    throw new Error(
      rateLimited
        ? `${board.company} PCSX search is rate limited`
        : `${board.company} PCSX search page one could not be read`,
    );
  }

  const parsed = parsePcsxPositions(firstPage, board.boardUrl);
  if (parsed.length === 0) {
    throw new Error(`${board.company} PCSX search page one carried no positions`);
  }

  const total = Math.min(parsePcsxCount(firstPage) || parsed.length, maxJobs);
  const remainingOffsets = Array.from(
    { length: Math.max(0, Math.ceil(total / pageSize) - 1) },
    (_, index) => (index + 1) * pageSize,
  );

  const rest = await mapWithinDeadline(
    remainingOffsets,
    pageConcurrency,
    startedAt,
    runDeadlineMs,
    async (start) => parsePcsxPositions(await readPage(start), board.boardUrl),
  );

  const listed = [...parsed, ...rest.flat()]
    .slice(0, maxJobs)
    .filter((job) => !excluded?.test(job.title));

  // Search rows carry no description, so without this every posting read
  // "Not Stated" for experience. Details are best-effort: past the deadline or
  // after a throttle the remaining rows keep their list-level text.
  const descriptions = new Map<string, string>();
  await mapWithinDeadline(
    listed.slice(0, maxDetails),
    detailConcurrency,
    startedAt,
    runDeadlineMs,
    async (job) => {
      if (rateLimited) return;
      const positionId = job.absoluteUrl.match(/\/job\/(\d+)/u)?.[1];
      if (!positionId) return;
      const detail = await readDetail(positionId);
      if (detail) descriptions.set(job.id, detail);
    },
  );

  return listed
    .map((job) => ({
      ...job,
      contentText: descriptions.get(job.id) ?? job.contentText,
    }))
    .map((job) => ({
      ...job,
      company: board.company,
      boardToken: board.token,
      updatedAt: null,
    })) satisfies GreenhouseJob[];
}
