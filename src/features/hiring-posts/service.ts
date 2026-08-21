import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchActorRunPosts,
  isApifyConfigured,
  readHiringPostFeed,
  runLinkedinPostSearch,
  type SearchWindow,
  writeHiringPostFeed,
} from "./apify";
import { enrichJobLinks } from "./enrichment";
import { consolidateHiringPosts, emptyHiringPostFeed, mergeHiringPostFeed } from "./feed";
import { normalizeHiringPosts, reclassifyHiringPost } from "./normalize";
import type { ApifyLinkedinPost, HiringPost, HiringPostFeed } from "./types";

export type HiringPostPageData = {
  configured: boolean;
  source: "apify" | "development-fixture" | "empty";
  error: string | null;
  feed: HiringPostFeed;
};

function reclassifyFeed(feed: HiringPostFeed, now = new Date()): HiringPostFeed {
  return {
    ...feed,
    posts: consolidateHiringPosts(feed.posts.map(reclassifyHiringPost), now),
  };
}

/**
 * The window the dashboard opens with. Calendar-day "today" is often nearly
 * empty, so it widens automatically until a reasonable feed size is reached —
 * mirroring the client-side fallback so the server can decide which posts get
 * their full text shipped in the initial payload.
 */
function defaultFeedWindow(posts: HiringPost[], now = new Date()) {
  const windows = [
    { age: "today" as const, ms: 0, calendar: true },
    { age: "24h" as const, ms: 24 * 60 * 60 * 1000 },
    { age: "3d" as const, ms: 3 * 24 * 60 * 60 * 1000 },
    { age: "7d" as const, ms: 7 * 24 * 60 * 60 * 1000 },
  ];
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const timestamp = now.getTime();

  // Mirrors the client defaults: non-technical audience, U.S.-only region,
  // the "To contact" queue (excluded posts are archived automatically).
  const inDefaultView = (post: HiringPost, window: (typeof windows)[number]) => {
    if (post.roleFamily === "Technical") return false;
    if (post.location?.status === "outside-us") return false;
    if (post.matchStatus === "excluded") return false;
    const posted = Date.parse(post.postedAt);
    if (window.calendar) return posted >= startOfToday.getTime() && timestamp - posted >= -5 * 60 * 1000;
    return timestamp - posted >= -5 * 60 * 1000 && timestamp - posted <= window.ms;
  };

  const countFor = (window: (typeof windows)[number]) =>
    posts.filter((post) => inDefaultView(post, window)).length;

  const minimumFeedSize = 6;
  const todayCount = countFor(windows[0]);
  const age = todayCount >= minimumFeedSize
    ? "today"
    : (windows.slice(1).find((window) => countFor(window) >= minimumFeedSize) ?? windows[windows.length - 1]).age;
  const chosen = windows.find((window) => window.age === age) ?? windows[windows.length - 1];

  return {
    age,
    visibleIds: new Set(posts.filter((post) => inDefaultView(post, chosen)).map((post) => post.id)),
  };
}

/**
 * Strips the heavy fields (full post text, match reasons) from every post that
 * is not part of the default view, so the initial HTML stays small. Those posts
 * keep their metadata for filtering and fetch their text on demand.
 */
function slimNonDefaultPosts(
  feed: HiringPostFeed,
  visibleIds: Set<string>,
): HiringPostFeed {
  return {
    ...feed,
    posts: feed.posts.map((post) => {
      if (visibleIds.has(post.id)) {
        return { ...post, contentOmitted: false };
      }
      return {
        ...post,
        content: "",
        reasons: [],
        exclusionReasons: [],
        contentOmitted: true,
      };
    }),
  };
}

async function developmentFixture() {
  if (process.env.NODE_ENV === "production") return null;
  try {
    const directory = path.join(process.cwd(), "development-only");
    const filename = (await readdir(directory))
      .filter((value) => /^dataset_linkedin-post-search_.+\.json$/u.test(value))
      .sort()
      .at(-1);
    if (!filename) return null;
    const raw = JSON.parse(await readFile(path.join(directory, filename), "utf8")) as unknown;
    return Array.isArray(raw) ? raw as ApifyLinkedinPost[] : null;
  } catch {
    return null;
  }
}

export async function ingestHiringPosts(
  rawPosts: ApifyLinkedinPost[],
  runId: string,
  now = new Date(),
) {
  const [stored, metadata] = await Promise.all([
    readHiringPostFeed(),
    enrichJobLinks(rawPosts),
  ]);
  const current = reclassifyFeed(stored, now);
  const normalized = normalizeHiringPosts(rawPosts, now, metadata);
  const next = mergeHiringPostFeed(current, normalized, {
    runId,
    rawCount: rawPosts.length,
    now,
  });
  if (next !== current) await writeHiringPostFeed(next);
  return next;
}

export async function ingestActorRun(runId: string) {
  return ingestHiringPosts(await fetchActorRunPosts(runId), runId);
}

export async function refreshHiringPosts(
  window: SearchWindow,
  maxPosts: number,
  companyBatchIndex = 0,
) {
  const rawPosts = await runLinkedinPostSearch(window, maxPosts, companyBatchIndex);
  return ingestHiringPosts(
    rawPosts,
    `manual-${window}-batch-${companyBatchIndex}-${Date.now()}`,
  );
}

export async function getHiringPostPageData(): Promise<HiringPostPageData> {
  if (isApifyConfigured()) {
    try {
      const feed = reclassifyFeed(await readHiringPostFeed());
      const { visibleIds } = defaultFeedWindow(feed.posts);
      return {
        configured: true,
        source: "apify",
        error: null,
        feed: slimNonDefaultPosts(feed, visibleIds),
      };
    } catch (error) {
      return {
        configured: true,
        source: "empty",
        error: error instanceof Error ? error.message : "Could not read the Apify feed",
        feed: emptyHiringPostFeed(),
      };
    }
  }

  const fixture = await developmentFixture();
  if (fixture) {
    const now = new Date();
    const posts = normalizeHiringPosts(fixture, now);
    const merged = mergeHiringPostFeed(emptyHiringPostFeed(), posts, {
      runId: "development-fixture",
      rawCount: fixture.length,
      now,
    });
    const { visibleIds } = defaultFeedWindow(merged.posts, now);
    return {
      configured: false,
      source: "development-fixture",
      error: null,
      feed: slimNonDefaultPosts(merged, visibleIds),
    };
  }

  return {
    configured: false,
    source: "empty",
    error: null,
    feed: emptyHiringPostFeed(),
  };
}
