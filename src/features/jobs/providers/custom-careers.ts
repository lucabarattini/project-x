import boards from "../../../../data/custom-careers-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export type CustomCareerBoard = GreenhouseBoard & {
  kind: "icims" | "renaissance" | "cyera";
};

export const customCareerBoards = boards as CustomCareerBoard[];

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x27;/giu, "'");
}

export function stripCustomHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<br\s*\/?>(?=\s*)/giu, "\n")
      .replace(/<li[^>]*>/giu, " - ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
}

function absoluteUrl(value: string, baseUrl: string) {
  return new URL(decodeHtml(value), baseUrl).toString();
}

function makeJob(
  board: CustomCareerBoard,
  id: string,
  title: string,
  url: string,
  location: string,
  contentText: string,
): GreenhouseJob {
  return {
    id,
    title: stripCustomHtml(title),
    company: board.company,
    boardToken: board.token,
    location: stripCustomHtml(location) || "Not listed",
    absoluteUrl: url,
    contentText: stripCustomHtml(contentText),
    postedAt: null,
    updatedAt: null,
  };
}

export function parseIcolsJobs(html: string, board: CustomCareerBoard) {
  const jobs: GreenhouseJob[] = [];
  const cards = html.match(/<li[^>]+iCIMS_JobCardItem[^>]*>[\s\S]*?<\/li>/giu) ?? [];

  for (const card of cards) {
    const link = card.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/iu);
    if (!link) continue;
    const id = link[1].match(/\/jobs\/(\d+)/iu)?.[1] ?? link[1];
    const category = card.match(/Job Category<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/iu)?.[1] ?? "";
    const experience = card.match(/Experience Level<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/iu)?.[1] ?? "";
    jobs.push(makeJob(board, id, link[2], absoluteUrl(link[1], board.boardUrl), "Not listed", `${category} ${experience} ${card}`));
  }
  return jobs;
}

export function parseRenaissanceJobs(html: string, board: CustomCareerBoard) {
  const jobs: GreenhouseJob[] = [];
  const pattern = /<a[^>]+href="([^"]*selectedPosition=([^"]+))"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>\s*<div>([\s\S]*?)<\/div>/giu;
  for (const match of html.matchAll(pattern)) {
    jobs.push(makeJob(board, match[2], match[3], absoluteUrl(match[1], board.boardUrl), match[4], ""));
  }
  return jobs;
}

export function parseCyeraJobs(html: string, board: CustomCareerBoard) {
  const jobs: GreenhouseJob[] = [];
  const pattern = /fs-list-field="itemTitle"[^>]*>([\s\S]*?)<\/div>[\s\S]*?fs-list-field="location"[^>]*>([\s\S]*?)<\/div>[\s\S]*?href="(https:\/\/www\.comeet\.com\/jobs\/cyera\/[^"]+)"/giu;
  for (const match of html.matchAll(pattern)) {
    const id = match[3].split("/").pop() ?? match[3];
    jobs.push(makeJob(board, id, match[1], match[3], match[2], ""));
  }
  return jobs;
}

function parseBoard(html: string, board: CustomCareerBoard) {
  if (board.kind === "icims") return parseIcolsJobs(html, board);
  if (board.kind === "renaissance") return parseRenaissanceJobs(html, board);
  return parseCyeraJobs(html, board);
}

async function fetchDetail(job: GreenhouseJob) {
  try {
    const response = await fetch(job.absoluteUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
    });
    if (!response.ok) return job;
    return { ...job, contentText: stripCustomHtml(await response.text()) };
  } catch {
    return job;
  }
}

export async function fetchLatestCustomCareerJobs() {
  const results = await Promise.all(customCareerBoards.map(async (board) => {
    try {
      const response = await fetch(board.apiUrl, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      });
      if (!response.ok) throw new Error(`${board.company} returned ${response.status}`);
      const jobs = parseBoard(await response.text(), board);
      return Promise.all(jobs.map(fetchDetail));
    } catch {
      return [];
    }
  }));
  return results.flat();
}
