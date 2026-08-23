import boards from "../../../../data/microsoft-boards.json";
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
 * Microsoft retired `gcsservices.careers.microsoft.com` (its hostname now
 * answers with a mismatched CDN certificate) and moved onto an Eightfold
 * PCSX site. `/api/pcsx/search` is one of the paths their robots.txt allows;
 * the older `/api/apply/v2/jobs` answers 403 "Not authorized for PCSX".
 * A page is capped at 10 rows server-side, so a US crawl is maxJobs/10 calls.
 */
export async function fetchLatestMicrosoftJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 300 } = options;
  const board = microsoftBoards[0];
  const pageSize = 10;
  const jobs: GreenhouseJob[] = [];
  // Wall-clock budget inside the caller's 25s provider timeout: a slow
  // window stops paging and keeps the postings already collected.
  const startedAt = Date.now();
  const runDeadlineMs = 20_000;

  for (let page = 0; page < Math.ceil(maxJobs / pageSize); page += 1) {
    if (Date.now() - startedAt > runDeadlineMs) {
      break;
    }

    const url = `${board.apiUrl}&start=${page * pageSize}&num=${pageSize}`;

    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "application/json",
          referer: board.boardUrl,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        },
      });
    } catch {
      break;
    }
    if (!response.ok) {
      break;
    }

    const parsed = parsePcsxPositions(await response.json(), board.boardUrl);
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
