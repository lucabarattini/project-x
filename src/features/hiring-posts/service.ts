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
import {
  consolidateHiringPosts,
  emptyHiringPostFeed,
  isInDefaultFeedView,
  mergeHiringPostFeed,
} from "./feed";
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
 * The posts the dashboard shows on arrival, so the server knows which ones get
 * their full text in the initial payload — a post shipped as metadata renders
 * a placeholder until its text arrives over the wire.
 *
 * The rule itself lives beside the feed, where it can be tested. This used to
 * open on the calendar day and widen itself until it found six posts, a rule
 * the client had to reimplement to stay in step; both copies are gone.
 */
function defaultViewPostIds(posts: HiringPost[], now = new Date()) {
  return new Set(
    posts.filter((post) => isInDefaultFeedView(post, now)).map((post) => post.id),
  );
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
      const visibleIds = defaultViewPostIds(feed.posts);
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
    const visibleIds = defaultViewPostIds(merged.posts, now);
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
