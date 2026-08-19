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
      signal: AbortSignal.timeout(8_000),
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

export async function fetchLatestWorkdayJobs() {
  const results = await Promise.all(
    workdayBoards.map(async (board) => {
      try {
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
            limit: 100,
            offset: 0,
            searchText: "",
          }),
        });

        if (!response.ok) {
          throw new Error(`${board.company} returned ${response.status}`);
        }

        const data = (await response.json()) as WorkdaySearchResponse;
        const jobs = await Promise.all(
          (data.jobPostings ?? []).map(async (job): Promise<GreenhouseJob | null> => {
            if (!job.externalPath) {
              return null;
            }

            const detail = await fetchWorkdayDetail(board, job.externalPath);
            const detailInfo = detail?.jobPostingInfo;
            const id = detailInfo?.jobRequisitionId ?? job.bulletFields?.[0] ?? job.externalPath;

            return {
              id,
              title: detailInfo?.title || job.title || "Untitled",
              company: board.company,
              boardToken: board.token,
              location: detailInfo?.location || job.locationsText || "Not listed",
              absoluteUrl: `${board.boardUrl}${job.externalPath}`,
              contentText: stripHtml(detailInfo?.jobDescription),
              postedAt: detailInfo?.startDate ?? parsePostedOn(job.postedOn),
              updatedAt: null,
            };
          }),
        );

        return jobs.filter((job): job is GreenhouseJob => job !== null);
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
