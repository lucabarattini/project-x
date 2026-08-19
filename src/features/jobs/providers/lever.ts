import boards from "../../../../data/lever-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  descriptionPlain?: string;
  description?: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
  };
  lists?: Array<{
    text?: string;
    content?: string;
  }>;
};

export const leverBoards = boards as GreenhouseBoard[];

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

function timestampToIso(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

export async function fetchLatestLeverJobs() {
  const results = await Promise.all(
    leverBoards.map(async (board) => {
      try {
        const response = await fetch(board.apiUrl, {
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(8_000),
          headers: {
            accept: "application/json",
            "user-agent": "Mozilla/5.0",
          },
        });

        if (!response.ok) {
          throw new Error(`${board.company} returned ${response.status}`);
        }

        const postings = (await response.json()) as LeverPosting[];

        return postings.map((posting): GreenhouseJob => ({
          id: posting.id ?? posting.hostedUrl ?? `${board.token}-${posting.text}`,
          title: posting.text || "Untitled",
          company: board.company,
          boardToken: board.token,
          location: posting.categories?.location || "Not listed",
          absoluteUrl: posting.hostedUrl || posting.applyUrl || board.boardUrl,
          contentText: [
            posting.categories?.team,
            posting.categories?.department,
            posting.categories?.commitment,
            posting.descriptionPlain,
            stripHtml(posting.description),
            ...(posting.lists ?? []).flatMap((list) => [list.text, stripHtml(list.content)]),
          ]
            .filter(Boolean)
            .join(" "),
          postedAt: timestampToIso(posting.createdAt),
          updatedAt: timestampToIso(posting.updatedAt),
        }));
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
