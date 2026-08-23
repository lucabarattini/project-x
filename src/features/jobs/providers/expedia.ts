import boards from "../../../../data/expedia-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type ExpediaBoard = GreenhouseBoard & {
  sitemapUrl: string;
};

export const expediaBoards = boards as ExpediaBoard[];

type SitemapEntry = {
  url: string;
  lastmod: string | null;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Parses the WordPress SEO jobs sitemap. Each <url> block carries the job
 * page URL and a <lastmod> used as the posting date.
 */
export function parseExpediaSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/giu) ?? []) {
    const url = block.match(/<loc>([^<]+)<\/loc>/iu)?.[1];
    if (!url) continue;
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/iu)?.[1] ?? null;
    entries.push({ url, lastmod });
  }
  return entries;
}

/**
 * Parses one server-rendered Expedia Group job page: <h1> title, location
 * from the og:title ("<Title> in <Location>"), and the description inside
 * the "Desc__copy" content block. Pages whose og:title carries an empty
 * location (" in ,") fall back to the location slug in the URL, then to
 * "Not listed".
 */
export function parseExpediaJobPage(
  html: string,
  url: string,
  lastmod: string | null,
): { id: string; title: string; location: string; contentText: string; postedAt: string | null } {
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "");

  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/iu)?.[1] ?? "";
  const inIndex = ogTitle.lastIndexOf(" in ");
  const ogLocation = (inIndex >= 0 ? ogTitle.slice(inIndex + 4).trim() : "")
    .replace(/^[,;\-\s]+/u, "")
    .replace(/[,;\-\s]+$/u, "")
    .trim();
  const location = ogLocation || locationFromUrl(url) || "Not listed";

  let description = "";
  const descStart = html.indexOf("Desc__copy");
  if (descStart >= 0) {
    const sectionEnd = html.indexOf("</section>", descStart);
    const raw = sectionEnd >= 0
      ? html.slice(descStart, sectionEnd)
      : html.slice(descStart, descStart + 20_000);
    description = stripHtml(raw);
  }

  const idMatch = url.match(/R-(\d+)/iu);
  return {
    id: idMatch ? `expedia-${idMatch[1]}` : url,
    title,
    location,
    contentText: description,
    postedAt: lastmod ? new Date(lastmod).toISOString() : null,
  };
}

/**
 * Turns the location slug in a job URL ("/job/<title>/seattle-wa/R-123/")
 * into a display location ("Seattle, WA"). Best-effort; returns "" when the
 * slug is missing ("-") or unparseable.
 */
export function locationFromUrl(url: string): string {
  const path = new URL(url).pathname;
  const segments = path.split("/").filter(Boolean);
  // /job/<title-slug>/<location-slug>/<req-slug>/
  const locationSlug = segments[2] ?? "";
  if (!locationSlug || locationSlug === "-" || /^R-\d+/iu.test(locationSlug)) {
    return "";
  }

  const parts = locationSlug.split("-").filter(Boolean);
  if (parts.length < 2) {
    return "";
  }

  const stateCode = parts.pop() ?? "";
  const city = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${city}, ${stateCode.toUpperCase()}`;
}

export async function fetchLatestExpediaJobs(options: { maxJobs?: number } = {}) {
  // The sitemap currently lists ~195 openings; default to covering all of
  // them rather than the earlier 120 cap that left roles out of the portal.
  const { maxJobs = 200 } = options;
  const board = expediaBoards[0];

  const sitemapResponse = await fetch(board.sitemapUrl, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!sitemapResponse.ok) {
    throw new Error(`Expedia sitemap returned ${sitemapResponse.status}`);
  }

  const entries = parseExpediaSitemap(await sitemapResponse.text())
    .filter((entry) => /\/job\//u.test(entry.url))
    .sort((left, right) => (right.lastmod ?? "").localeCompare(left.lastmod ?? ""))
    .slice(0, maxJobs);

  const jobs = await mapWithConcurrency<{ url: string; lastmod: string | null }, GreenhouseJob | null>(
    entries,
    8,
    async (entry): Promise<GreenhouseJob | null> => {
    try {
      const response = await fetch(entry.url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      });
      if (!response.ok) {
        return null;
      }

      const parsed = parseExpediaJobPage(await response.text(), entry.url, entry.lastmod);
      if (!parsed.title) {
        return null;
      }

      return {
        id: parsed.id,
        title: parsed.title,
        company: board.company,
        boardToken: board.token,
        location: parsed.location || "Not listed",
        absoluteUrl: entry.url,
        contentText: parsed.contentText,
        postedAt: parsed.postedAt,
        updatedAt: null,
      };
    } catch {
      return null;
    }
    },
  );

  return jobs.filter((job): job is GreenhouseJob => job !== null);
}
