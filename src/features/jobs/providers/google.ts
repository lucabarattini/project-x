import boards from "../../../../data/google-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type FetchGoogleJobsOptions = {
  maxJobs?: number;
  maxPages?: number;
};

type ParsedGoogleJob = {
  id: string;
  title: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
  updatedAt: string | null;
};

type GooglePayloadJob = {
  contentText: string;
  postedAt: string | null;
  updatedAt: string | null;
};

export const googleBoards = boards as GreenhouseBoard[];

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&nbsp;/giu, " ");
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<li[^>]*>/giu, " - ")
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/(p|div|section|h2|h3|h4|ul|ol)>/giu, "\n")
      .replace(/<[^>]+>/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  );
}

function resolveGoogleUrl(path: string) {
  return new URL(
    decodeHtml(path),
    "https://www.google.com/about/careers/applications/",
  ).toString();
}

function googlePageUrl(page: number) {
  const url = new URL(googleBoards[0].apiUrl);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

function protobufTimestampToIso(value: unknown) {
  if (!Array.isArray(value) || typeof value[0] !== "number") {
    return null;
  }

  const seconds = value[0];
  const nanoseconds = typeof value[1] === "number" ? value[1] : 0;
  const timestamp = seconds * 1000 + Math.floor(nanoseconds / 1_000_000);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nestedHtmlText(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map(stripHtml)
    .filter(Boolean)
    .join(" ");
}

/**
 * Google Careers server-renders its current result set in an
 * AF_initDataCallback script named `ds:1`. Each job row stores its stable ID at
 * index 0, the original publish timestamp at index 12, and its latest update
 * timestamp at index 13. Both timestamps use protobuf's [seconds, nanos] form.
 */
export function parseGoogleJobsPayloadHtml(html: string) {
  const payloadJobs = new Map<string, GooglePayloadJob>();
  const script = html.match(
    /<script\b[^>]*class=["']ds:1["'][^>]*>([\s\S]*?)<\/script>/iu,
  )?.[1];

  if (!script) {
    return payloadJobs;
  }

  const dataSource = script.match(
    /\bdata\s*:\s*([\s\S]*),\s*sideChannel\s*:\s*\{\s*\}\s*\}\s*\)\s*;?\s*$/u,
  )?.[1];

  if (!dataSource) {
    return payloadJobs;
  }

  try {
    const payload = JSON.parse(dataSource) as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
      return payloadJobs;
    }

    for (const row of payload[0]) {
      if (!Array.isArray(row) || typeof row[0] !== "string") {
        continue;
      }

      payloadJobs.set(row[0], {
        contentText: [nestedHtmlText(row[3]), nestedHtmlText(row[4]), nestedHtmlText(row[10])]
          .filter(Boolean)
          .join(" "),
        postedAt: protobufTimestampToIso(row[12]),
        updatedAt: protobufTimestampToIso(row[13]),
      });
    }
  } catch {
    return payloadJobs;
  }

  return payloadJobs;
}

export function parseGoogleJobsHtml(html: string) {
  const jobs: ParsedGoogleJob[] = [];
  const seen = new Set<string>();
  const payloadJobs = parseGoogleJobsPayloadHtml(html);
  const jobLinks = [...html.matchAll(/href="([^"]*jobs\/results\/[^"#]+[^"]*)"/giu)];

  for (const match of jobLinks) {
    const href = match[1];
    if (!href || href.includes("accounts.google.com")) {
      continue;
    }

    const windowStart = Math.max(0, match.index - 3500);
    const windowEnd = Math.min(html.length, match.index + 700);
    const block = html.slice(windowStart, windowEnd);
    const titleMatches = [...block.matchAll(/<h3 class="QJPWVe">([\s\S]*?)<\/h3>/giu)];
    const ariaTitle = block.match(/aria-label="Learn more about ([^"]+)"/iu)?.[1];
    const title = ariaTitle ?? titleMatches.at(-1)?.[1];

    if (!href || !title) {
      continue;
    }

    const absoluteUrl = resolveGoogleUrl(href);
    const id = absoluteUrl.match(/jobs\/results\/([^/?#]+)/iu)?.[1] ?? absoluteUrl;
    const numericId = id.match(/^(\d+)/u)?.[1];
    const payloadJob = numericId ? payloadJobs.get(numericId) : undefined;

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    const locationBlocks = [...block.matchAll(/<span class="pwO9Dc[^"]*">([\s\S]*?)<\/span>\s*(?:<\/p>|<div|$)/giu)];
    const locationBlock = locationBlocks.at(-1)?.[1] ?? "";
    const locations = [...locationBlock.matchAll(/<span class="r0wTof[^"]*">([\s\S]*?)<\/span>/giu)]
      .map((match) => stripHtml(match[1]))
      .map((location) => location.replace(/^;\s*/u, "").trim())
      .filter(Boolean);
    const contentText = payloadJob?.contentText || stripHtml(block);

    jobs.push({
      id,
      title: stripHtml(title),
      location: locations.join("; ") || "United States",
      absoluteUrl,
      contentText,
      postedAt: payloadJob?.postedAt ?? null,
      updatedAt: payloadJob?.updatedAt ?? null,
    });
  }

  return jobs;
}

export function parseGoogleDatePostedHtml(html: string) {
  const scripts = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu),
  ];

  for (const script of scripts) {
    try {
      const data = JSON.parse(decodeHtml(script[1]).trim()) as unknown;
      const nodes = Array.isArray(data) ? data : [data];

      for (const node of nodes) {
        if (
          node &&
          typeof node === "object" &&
          "datePosted" in node &&
          typeof node.datePosted === "string"
        ) {
          return node.datePosted;
        }
      }
    } catch {
      continue;
    }
  }

  const fallback = html.match(/"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2}(?:T[^"]+)?)"/iu)?.[1];
  return fallback ?? null;
}

async function fetchGooglePage(page: number) {
  const response = await fetch(googlePageUrl(page), {
    signal: AbortSignal.timeout(8_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0",
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Google returned ${response.status}`);
  }

  return response.text();
}

async function fetchGooglePagesConcurrently(maxPages: number) {
  const pages: Array<{ page: number; html: string | null }> = [];
  const limit = Math.min(maxPages, 12);
  let index = 0;

  async function worker() {
    while (index < limit) {
      const page = index + 1;
      index += 1;
      try {
        pages.push({ page, html: await fetchGooglePage(page) });
      } catch {
        pages.push({ page, html: null });
      }
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));
  return pages.sort((left, right) => left.page - right.page);
}

export async function fetchLatestGoogleJobs(options: FetchGoogleJobsOptions = {}) {
  const { maxJobs = 400, maxPages = 12 } = options;
  const board = googleBoards[0];
  const jobs: GreenhouseJob[] = [];
  const seen = new Set<string>();

  for (const { html } of await fetchGooglePagesConcurrently(maxPages)) {
    if (!html) continue;
    try {
      const parsedJobs = parseGoogleJobsHtml(html);

      if (parsedJobs.length === 0) {
        continue;
      }

      for (const job of parsedJobs) {
        const duplicateCount = [...seen].filter((id) => id === job.id || id.startsWith(`${job.id}#`)).length;
        const id = duplicateCount === 0 ? job.id : `${job.id}#${duplicateCount + 1}`;
        seen.add(id);

        jobs.push({
          id,
          title: job.title,
          company: "Google",
          boardToken: board.token,
          location: job.location,
          absoluteUrl: job.absoluteUrl,
          contentText: job.contentText,
          postedAt: job.postedAt,
          updatedAt: job.updatedAt,
        });

        if (jobs.length >= maxJobs) {
          break;
        }
      }
    } catch {
      break;
    }
  }

  return jobs;
}
