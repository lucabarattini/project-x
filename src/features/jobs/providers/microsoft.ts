import boards from "../../../../data/microsoft-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export const microsoftBoards = boards as GreenhouseBoard[];

export type EightfoldPosition = {
  id?: string | number;
  name?: string;
  posting_name?: string;
  location?: string;
  locations?: string[];
  department?: string | null;
  business_unit?: string | null;
  t_create?: number;
  t_update?: number;
  canonicalPositionUrl?: string;
};

export type ParsedEightfoldJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
};

/**
 * Normalizes one `/api/apply/v2/jobs` response. Eightfold positions carry
 * `name` (fallback `posting_name`), a flat `location` plus `locations[]`,
 * epoch-seconds `t_create`/`t_update`, and `canonicalPositionUrl` (fallback
 * `careers?pid=<id>`).
 */
export function parseEightfoldJobs(
  json: unknown,
  fallbackBaseUrl: string,
): ParsedEightfoldJob[] {
  const positions = (json as { positions?: unknown } | null)?.positions;
  if (!Array.isArray(positions)) {
    return [];
  }

  const jobs: ParsedEightfoldJob[] = [];
  for (const position of positions as EightfoldPosition[]) {
    const title =
      typeof position.name === "string" && position.name.trim()
        ? position.name.trim()
        : typeof position.posting_name === "string"
          ? position.posting_name.trim()
          : "";
    if (!title) continue;

    let absoluteUrl = "";
    if (
      typeof position.canonicalPositionUrl === "string" &&
      /^https:\/\//u.test(position.canonicalPositionUrl)
    ) {
      absoluteUrl = position.canonicalPositionUrl;
    } else if (position.id !== undefined && position.id !== null) {
      absoluteUrl = `${fallbackBaseUrl}?pid=${position.id}`;
    }
    if (!absoluteUrl) continue;

    const locationParts = [
      typeof position.location === "string" ? position.location : "",
      ...(Array.isArray(position.locations)
        ? position.locations.filter((item): item is string => typeof item === "string")
        : []),
    ].filter(Boolean);

    const postedAt =
      typeof position.t_create === "number"
        ? new Date(position.t_create * 1000).toISOString()
        : typeof position.t_update === "number"
          ? new Date(position.t_update * 1000).toISOString()
          : null;

    jobs.push({
      id: String(position.id ?? absoluteUrl),
      title,
      location: [...new Set(locationParts)].join(" · ") || "Not listed",
      absoluteUrl,
      contentText: [position.department, position.business_unit]
        .filter((item): item is string => typeof item === "string" && Boolean(item))
        .join(" "),
      postedAt,
    });
  }

  return jobs;
}

/**
 * Microsoft's careers site is now built on Eightfold AI (the old
 * gcsservices endpoint is dead). The public per-tenant jobs endpoint caps a
 * page at 10 rows, so a full crawl is count/10 requests; maxJobs bounds it.
 */
export async function fetchLatestMicrosoftJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 200 } = options;
  const board = microsoftBoards[0];
  const pageSize = 10;
  const maxPages = Math.ceil(maxJobs / pageSize);
  const jobs: GreenhouseJob[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const url = `${board.apiUrl}?start=${start}&num=${pageSize}`;
    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      });
    } catch {
      break;
    }
    if (!response.ok) {
      break;
    }

    const parsed = parseEightfoldJobs(await response.json(), board.boardUrl);
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
