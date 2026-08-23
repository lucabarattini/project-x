import boards from "../../../../data/microsoft-boards.json";
import { mapWithinDeadline, pageConcurrency } from "./concurrency";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export const microsoftBoards = boards as GreenhouseBoard[];

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
 * Collapses one `locations[]` entry. Microsoft pads multi-site postings out
 * to "United States, Multiple Locations, Multiple Locations", so repeated
 * segments are dropped rather than shown back to the reader.
 */
export function formatPcsxLocation(locations: string[] | undefined) {
  const first = Array.isArray(locations)
    ? locations.find((entry) => typeof entry === "string" && entry.trim())
    : undefined;
  if (!first) {
    return "Not listed";
  }

  const segments = first
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return [...new Set(segments)].join(", ") || "Not listed";
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
      location: formatPcsxLocation(position.locations),
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
export async function fetchLatestMicrosoftJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 600 } = options;
  const board = microsoftBoards[0];
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

  const firstPage = await readPage(0);
  const parsed = parsePcsxPositions(firstPage, board.boardUrl);
  if (parsed.length === 0) {
    return [];
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

  return [...parsed, ...rest.flat()]
    .slice(0, maxJobs)
    .map((job) => ({
      ...job,
      company: board.company,
      boardToken: board.token,
      updatedAt: null,
    })) satisfies GreenhouseJob[];
}
