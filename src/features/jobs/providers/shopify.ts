import boards from "../../../../data/shopify-boards.json";
import { stripAshbyHtml } from "./ashby";
import { detailConcurrency, mapWithinDeadline } from "./concurrency";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

export const shopifyBoards = boards as GreenhouseBoard[];

const headers = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

type Listing = {
  id: string;
  title: string;
  team: string | null;
  employmentType: string | null;
  location: string;
  postedAt: string | null;
  url: string;
};

/**
 * Shopify's careers site runs on Ashby but publishes no Ashby job board. Its
 * pages are React Router, and the loader data ships inside the HTML as a
 * turbo-stream: one flat JSON array where an object is {"_<key index>": value
 * index}, an array is a list of indexes, and a negative number is null.
 */
export function decodeTurboStream(html: string): unknown {
  const chunks = [...html.matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/gu)]
    .map((match) => JSON.parse(match[1]) as string);
  if (chunks.length === 0) return null;

  const values = JSON.parse(chunks.join("").split("\n")[0]) as unknown[];
  const decoded = new Map<number, unknown>();
  const hydrate = (index: number): unknown => {
    if (index < 0) return null;
    if (decoded.has(index)) return decoded.get(index);
    const value = values[index];
    if (Array.isArray(value)) {
      const list: unknown[] = [];
      decoded.set(index, list);
      for (const item of value) list.push(typeof item === "number" ? hydrate(item) : item);
      return list;
    }
    if (value && typeof value === "object") {
      const record: Record<string, unknown> = {};
      decoded.set(index, record);
      for (const [key, item] of Object.entries(value)) {
        record[String(values[Number(key.slice(1))])] = typeof item === "number" ? hydrate(item) : item;
      }
      return record;
    }
    return value;
  };
  return hydrate(0);
}

function findRecords(root: unknown, matches: (record: Record<string, unknown>) => boolean) {
  const found: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (matches(record)) {
      found.push(record);
      return;
    }
    Object.values(record).forEach(walk);
  };
  walk(root);
  return found;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Every listed posting on shopify.com/careers. All of them are remote, pinned to a region. */
export function parseShopifyCareers(html: string): Listing[] {
  return findRecords(decodeTurboStream(html), (record) => Boolean(text(record.externalLink) && text(record.title)))
    .filter((record) => record.isListed !== false)
    .map((record) => {
      const region = text(record.locationName) ?? "Not listed";
      return {
        id: `shopify-${text(record.id) ?? text(record.externalLink)}`,
        title: text(record.title) ?? "Untitled",
        team: text(record.teamName),
        employmentType: text(record.employmentType),
        location: record.workplaceType === "Remote" ? `Remote - ${region}` : region,
        postedAt: text(record.publishedDate),
        url: text(record.externalLink) ?? shopifyBoards[0].boardUrl,
      };
    });
}

/** The description on a posting's own page, which carries the years of experience. */
export function parseShopifyDescription(html: string) {
  const [record] = findRecords(decodeTurboStream(html), (item) => Boolean(text(item.descriptionPlain) || text(item.descriptionHtml)));
  if (!record) return "";
  return text(record.descriptionPlain) ?? stripAshbyHtml(String(record.descriptionHtml));
}

export async function fetchLatestShopifyJobs() {
  const board = shopifyBoards[0];
  const startedAt = Date.now();
  const response = await fetch(board.boardUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers });
  if (!response.ok) throw new Error(`Shopify careers returned ${response.status}`);

  const listings = parseShopifyCareers(await response.text());
  // A careers page that decodes to nothing is a format change, not a board with no openings.
  if (listings.length === 0) throw new Error("Shopify careers page carried no postings");

  // One page per posting for its description; whatever the deadline leaves unread stays listed without one.
  const described = new Map(await mapWithinDeadline(listings, detailConcurrency, startedAt, 40_000, async (listing) => {
    try {
      const page = await fetch(listing.url, { cache: "no-store", signal: AbortSignal.timeout(8_000), headers });
      return [listing.id, page.ok ? parseShopifyDescription(await page.text()) : ""] as const;
    } catch {
      return [listing.id, ""] as const;
    }
  }));

  return listings.map((listing): GreenhouseJob => ({
    id: listing.id,
    title: listing.title,
    company: board.company,
    boardToken: board.token,
    location: listing.location,
    absoluteUrl: listing.url,
    contentText: [listing.team, listing.employmentType, described.get(listing.id)].filter(Boolean).join(" "),
    postedAt: listing.postedAt,
    updatedAt: null,
  }));
}
