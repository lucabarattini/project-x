import boards from "../../../../data/meta-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export const metaBoards = boards as GreenhouseBoard[];

export type MetaJobSearchItem = {
  id?: string;
  title?: string;
  locations?: string[];
  teams?: string[];
};

export type ParsedMetaJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: null;
};

/**
 * Normalizes the GraphQL `data.job_search` array (id, title, locations,
 * teams). The doc_id below is the one used by the careers SPA; Meta rotates
 * it periodically, so failures degrade to [] rather than throwing.
 */
export function parseMetaJobSearch(json: unknown): ParsedMetaJob[] {
  const jobs = (json as { data?: { job_search?: unknown } } | null)?.data?.job_search;
  if (!Array.isArray(jobs)) {
    return [];
  }

  const parsed: ParsedMetaJob[] = [];
  for (const job of jobs as MetaJobSearchItem[]) {
    const id = typeof job.id === "string" ? job.id : "";
    const title = typeof job.title === "string" ? job.title.trim() : "";
    if (!id || !title) continue;

    parsed.push({
      id,
      title,
      location:
        Array.isArray(job.locations) && job.locations.length > 0
          ? job.locations.filter((item): item is string => typeof item === "string").join(" · ")
          : "Not listed",
      absoluteUrl: `https://www.metacareers.com/jobs/${id}`,
      contentText:
        Array.isArray(job.teams) && job.teams.length > 0
          ? job.teams.filter((item): item is string => typeof item === "string").join(" ")
          : "",
      postedAt: null,
    });
  }

  return parsed;
}

/**
 * Meta's careers SPA loads jobs through a GraphQL endpoint that requires the
 * page's `lsd` anti-CSRF token and a `datr` cookie, plus a rotating doc_id
 * (reference: kbhujbal/go-get-jobs). The flow is implemented best-effort and
 * degrades to [] whenever Meta rejects the request.
 */
export async function fetchLatestMetaJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 120 } = options;
  const board = metaBoards[0];
  const pageSize = 10;
  const jobs: GreenhouseJob[] = [];

  // 1. Visit the careers page to obtain the lsd token and datr cookie.
  let pageResponse: Response;
  try {
    pageResponse = await fetch("https://www.metacareers.com/jobs/", {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
  } catch {
    return jobs;
  }
  if (!pageResponse.ok) {
    return jobs;
  }

  const html = await pageResponse.text();
  const lsd =
    html.match(/"LSD",\[\],\{"token":"([a-zA-Z0-9]+)"/u)?.[1] ??
    html.match(/name="lsd" value="([a-zA-Z0-9]+)"/u)?.[1];
  const datr = (pageResponse.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0])
    .find((cookie) => cookie.startsWith("datr="))
    ?.slice("datr=".length);

  if (!lsd || !datr) {
    return jobs;
  }

  // 2. Query the GraphQL endpoint page by page.
  for (let page = 1; page <= Math.ceil(maxJobs / pageSize); page += 1) {
    const variables = JSON.stringify({
      search_input: {
        q: "",
        divisions: [],
        offices: ["North America"],
        roles: [],
        leadership_levels: ["Individual Contributor"],
        saved_jobs: [],
        saved_searches: [],
        sub_teams: [],
        teams: [],
        is_leadership: false,
        is_remote_only: false,
        sort_by_new: true,
        page,
        results_per_page: pageSize,
      },
    });

    let response: Response;
    try {
      response = await fetch(board.apiUrl, {
        method: "POST",
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          origin: "https://www.metacareers.com",
          referer: "https://www.metacareers.com/jobs/",
          cookie: `datr=${datr}`,
        },
        body: new URLSearchParams({
          lsd,
          variables,
          doc_id: "9114524511922157",
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "useFusionJobsListQuery",
        }).toString(),
      });
    } catch {
      break;
    }
    if (!response.ok) {
      break;
    }

    const parsed = parseMetaJobSearch(await response.json());
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
