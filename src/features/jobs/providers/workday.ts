import boards from "../../../../data/workday-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type WorkdayBoard = GreenhouseBoard & {
  detailUrlBase: string;
};

type WorkdaySearchJob = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

type WorkdaySearchResponse = {
  jobPostings?: WorkdaySearchJob[];
};

/** List-level job carrying the externalPath needed for the detail fetch. */
type WorkdayListJob = GreenhouseJob & {
  externalPath: string;
};

type WorkdayDetailResponse = {
  jobPostingInfo?: {
    id?: string;
    title?: string;
    jobDescription?: string;
    startDate?: string;
    jobRequisitionId?: string;
    location?: string;
  };
};

export const workdayBoards = boards as WorkdayBoard[];

// Workday's CXS API rejects page sizes above 20 with HTTP 400, so the search
// must paginate with limit=20 and advance the offset.
const searchPageSize = 20;
const maxSearchPages = 10;

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

function parsePostedOn(value?: string) {
  if (!value) {
    return null;
  }

  if (/today/iu.test(value)) {
    return new Date().toISOString();
  }

  const daysAgo = value.match(/posted\s+(\d+)\s+days?\s+ago/iu);
  if (daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - Number(daysAgo[1]));
    return date.toISOString();
  }

  return null;
}

async function fetchWorkdayDetail(board: WorkdayBoard, externalPath: string) {
  try {
    const response = await fetch(`${board.detailUrlBase}${externalPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WorkdayDetailResponse;
  } catch {
    return null;
  }
}

async function searchWorkdayBoard(board: WorkdayBoard): Promise<WorkdayListJob[]> {
  const allJobs: WorkdayListJob[] = [];

  for (let page = 0; page < maxSearchPages; page += 1) {
    const offset = page * searchPageSize;
    const response = await fetch(board.apiUrl, {
      method: "POST",
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: searchPageSize,
        offset,
        searchText: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`${board.company} returned ${response.status}`);
    }

    const data = (await response.json()) as WorkdaySearchResponse;
    const postings = data.jobPostings ?? [];
    for (const job of postings) {
      if (!job.externalPath) {
        continue;
      }
      allJobs.push({
        id: job.bulletFields?.[0] ?? job.externalPath,
        title: job.title || "Untitled",
        company: board.company,
        boardToken: board.token,
        location: job.locationsText || "Not listed",
        absoluteUrl: `${board.boardUrl}${job.externalPath}`,
        contentText: "",
        postedAt: parsePostedOn(job.postedOn),
        updatedAt: null,
        externalPath: job.externalPath,
      });
    }

    if (postings.length < searchPageSize) {
      break;
    }
  }

  return allJobs;
}

/**
 * Fills in descriptions from each job's detail page with bounded concurrency
 * and a wall-clock deadline, so a slow Workday degrades to list-level data
 * instead of blowing the provider budget.
 */
async function enrichWorkdayDetails(
  jobs: WorkdayListJob[],
  board: WorkdayBoard,
  startedAt: number,
  deadlineMs: number,
) {
  const detailed: GreenhouseJob[] = [];
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      if (Date.now() - startedAt > deadlineMs) {
        detailed.push(current);
        continue;
      }
      const detail = await fetchWorkdayDetail(board, current.externalPath);
      const info = detail?.jobPostingInfo;
      detailed.push({
        id: current.id,
        title: info?.title || current.title,
        company: current.company,
        boardToken: current.boardToken,
        location: info?.location || current.location,
        absoluteUrl: current.absoluteUrl,
        contentText: stripHtml(info?.jobDescription),
        postedAt: info?.startDate ?? current.postedAt,
        updatedAt: null,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, worker));
  return detailed;
}

export async function fetchLatestWorkdayJobs() {
  const startedAt = Date.now();
  const results = await Promise.all(
    workdayBoards.map(async (board) => {
      try {
        const jobs = await searchWorkdayBoard(board);
        return enrichWorkdayDetails(jobs, board, startedAt, 15_000);
      } catch {
        return [];
      }
    }),
  );

  return results.flat().sort((a, b) => {
    const left = a.postedAt ? Date.parse(a.postedAt) : 0;
    const right = b.postedAt ? Date.parse(b.postedAt) : 0;
    return right - left;
  });
}
