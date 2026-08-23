import boards from "../../../../data/meta-boards.json";
import { detailConcurrency, mapWithinDeadline } from "./concurrency";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type MetaBoard = GreenhouseBoard & {
  sitemapUrl: string;
};

export const metaBoards = boards as MetaBoard[];

export type MetaJobPostingLd = {
  "@type"?: string;
  title?: string;
  datePosted?: string;
  employmentType?: string;
  description?: string;
  qualifications?: string;
  responsibilities?: string;
  jobLocation?: {
    name?: string;
    address?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  }[];
};

export type ParsedMetaJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
};

/**
 * Meta answers 400 to requests that do not look like a navigating browser,
 * so every call — sitemap included — carries a full document header set.
 */
const browserHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="139", "Not;A=Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

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

/**
 * Pulls the job-detail URLs out of the sitemap named in metacareers'
 * robots.txt. Every entry shares one <lastmod> (the sitemap build time), so
 * the real posting date has to come from the detail page.
 */
export function parseMetaSitemap(xml: string): string[] {
  const urls: string[] = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/giu) ?? []) {
    const url = block.match(/<loc>([^<]+)<\/loc>/iu)?.[1];
    if (url && /\/job_details\//u.test(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Reads the JobPosting JSON-LD block Meta renders into every job page. The
 * GraphQL feed behind the careers SPA needs a per-session `lsd` token plus a
 * doc_id that Meta rotates; the structured-data block carries the same
 * fields, including a real `datePosted`, and does not move.
 */
export function parseMetaJobPage(html: string, url: string): ParsedMetaJob | null {
  let posting: MetaJobPostingLd | null = null;
  for (const block of html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/giu,
  ) ?? []) {
    const json = block.replace(/^<script[^>]*>/iu, "").replace(/<\/script>$/iu, "");
    try {
      const parsed = JSON.parse(json) as MetaJobPostingLd;
      if (parsed?.["@type"] === "JobPosting") {
        posting = parsed;
        break;
      }
    } catch {
      continue;
    }
  }

  const title = posting?.title?.trim() ?? "";
  if (!title) {
    return null;
  }

  const locations = (posting?.jobLocation ?? [])
    .map((place) => {
      const address = place?.address;
      const parts = [
        address?.addressLocality || place?.name || "",
        address?.addressRegion || "",
        address?.addressCountry || "",
      ]
        .map((part) => part.trim())
        .filter(Boolean);
      return [...new Set(parts)].join(", ");
    })
    .filter(Boolean);

  const postedAt = Date.parse(posting?.datePosted ?? "");

  return {
    id: url.match(/job_details\/(\d+)/u)?.[1] ?? url,
    title,
    location: [...new Set(locations)].join(" · ") || "Not listed",
    absoluteUrl: url,
    contentText: stripHtml(
      [posting?.description, posting?.responsibilities, posting?.qualifications]
        .filter(Boolean)
        .join(" "),
    ),
    postedAt: Number.isNaN(postedAt) ? null : new Date(postedAt).toISOString(),
  };
}

/**
 * Crawls the sitemap, then reads each posting's structured data. The sitemap
 * lists ~870 openings and gives no ordering signal, so `maxJobs` decides how
 * much of it is covered per run: one detail fetch per posting is the price of
 * a real `datePosted`.
 */
export async function fetchLatestMetaJobs(options: { maxJobs?: number } = {}) {
  const { maxJobs = 869 } = options;
  const board = metaBoards[0];
  // Wall-clock budget for the whole run, inside the caller's provider timeout.
  // The sitemap carries no ordering signal, so whatever the deadline cuts off
  // is an arbitrary slice rather than the oldest postings.
  const startedAt = Date.now();
  const runDeadlineMs = 45_000;


  const sitemapResponse = await fetch(board.sitemapUrl, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15_000),
    headers: browserHeaders,
  });
  if (!sitemapResponse.ok) {
    throw new Error(`Meta sitemap returned ${sitemapResponse.status}`);
  }

  const urls = parseMetaSitemap(await sitemapResponse.text()).slice(0, maxJobs);

  const jobs = await mapWithinDeadline<string, GreenhouseJob | null>(
    urls,
    detailConcurrency,
    startedAt,
    runDeadlineMs,
    async (url): Promise<GreenhouseJob | null> => {
      try {
        const response = await fetch(url, {
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10_000),
          headers: browserHeaders,
        });
        if (!response.ok) {
          return null;
        }

        const parsed = parseMetaJobPage(await response.text(), url);
        if (!parsed) {
          return null;
        }

        return {
          ...parsed,
          company: board.company,
          boardToken: board.token,
          updatedAt: null,
        };
      } catch {
        return null;
      }
    },
  );

  return jobs.filter((job): job is GreenhouseJob => job !== null);
}
