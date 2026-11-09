import boards from "../../../../data/microsoft-boards.json";
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
 *
 * A page holds 10 rows and Microsoft throttles hard per IP: on 2026-11-09 two
 * pages 1.5 s apart drew a 429, eight at once all did, and the cooldown
 * outlived the run. Reading ~60 pages per build therefore failed or stopped
 * partway on most GitHub runs, and each partial read shrank the board (600 to
 * 220 roles in five days). So pages are read one at a time, a few seconds
 * apart, newest first, and only until they stop turning up postings the board
 * lacks; the build keeps the rest from earlier builds. `known` holds the ids
 * the board already has. Details are fetched for new postings only.
 */
export async function fetchLatestPcsxJobs(board: PcsxBoard, known: Set<string> = new Set()) {
  const maxJobs = 600;
  const pageSize = 10;
  const pauseMs = 4_000;
  const maxDetails = 10;
  const excluded = board.excludeTitlePattern
    ? new RegExp(board.excludeTitlePattern, "iu")
    : null;
  const startedAt = Date.now();
  const runDeadlineMs = 75_000;
  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));
  const headers = {
    accept: "application/json",
    referer: board.boardUrl,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  };

  let rateLimited = false;

  // One retry after a pause: the throttle sometimes lets the next call through.
  async function readJson(url: string | URL, retried = false): Promise<unknown> {
    if (rateLimited) return null;
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers });
      // 429 is the throttle and 403 is the cooldown that follows it.
      if (response.status === 429 || response.status === 403) {
        if (retried) {
          rateLimited = true;
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return readJson(url, true);
      }
      return response.ok ? ((await response.json()) as unknown) : null;
    } catch {
      return null;
    }
  }

  const readPage = (start: number) => readJson(`${board.apiUrl}&start=${start}&num=${pageSize}`);

  // Page one decides whether this run is trustworthy at all: a throttled first
  // page is an outage, never "no openings", so the build keeps the last copy.
  const firstPage = await readPage(0);
  if (firstPage === null) {
    throw new Error(
      rateLimited
        ? `${board.company} PCSX search is rate limited`
        : `${board.company} PCSX search page one could not be read`,
    );
  }
  const first = parsePcsxPositions(firstPage, board.boardUrl);
  if (first.length === 0) {
    throw new Error(`${board.company} PCSX search page one carried no positions`);
  }

  // "known" pages count toward stopping; pages of only excluded titles (store
  // shifts at Starbucks) say nothing either way.
  const verdict = (page: ParsedPcsxJob[]) => {
    const kept = page.filter((job) => !excluded?.test(job.title));
    if (kept.length === 0) return "none";
    return kept.every((job) => known.has(job.id)) ? "known" : "new";
  };

  const total = Math.min(parsePcsxCount(firstPage) || first.length, maxJobs);
  const listed = [...first];
  let quiet = verdict(first) === "known" ? 1 : 0;
  for (let start = pageSize; start < total && quiet < 2 && !rateLimited; start += pageSize) {
    if (Date.now() - startedAt > runDeadlineMs) break;
    await pause();
    const page = parsePcsxPositions(await readPage(start), board.boardUrl);
    if (page.length === 0) break;
    listed.push(...page);
    const seen = verdict(page);
    if (seen === "known") quiet += 1;
    if (seen === "new") quiet = 0;
  }

  const kept = listed.filter((job) => !excluded?.test(job.title));

  // Search rows carry no description, so without this a new posting reads
  // "Not Stated" for experience. Best-effort, and for new postings only.
  const descriptions = new Map<string, string>();
  for (const job of kept.filter((item) => !known.has(item.id)).slice(0, maxDetails)) {
    if (rateLimited || Date.now() - startedAt > runDeadlineMs) break;
    const positionId = job.absoluteUrl.match(/\/job\/(\d+)/u)?.[1];
    if (!positionId) continue;
    await pause();
    const url = new URL("/api/pcsx/position_details", board.apiUrl);
    url.searchParams.set("position_id", positionId);
    url.searchParams.set("domain", new URL(board.apiUrl).searchParams.get("domain") ?? "");
    url.searchParams.set("hl", "en");
    const text = parsePcsxDescription(await readJson(url));
    if (text) descriptions.set(job.id, text);
  }

  return kept.map((job) => ({
    ...job,
    contentText: descriptions.get(job.id) ?? job.contentText,
    company: board.company,
    boardToken: board.token,
    updatedAt: null,
  })) satisfies GreenhouseJob[];
}
