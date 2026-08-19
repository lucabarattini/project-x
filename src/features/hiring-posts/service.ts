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
import type { ApifyLinkedinPost, HiringPostFeed } from "./types";

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
      return {
        configured: true,
        source: "apify",
        error: null,
        feed: reclassifyFeed(await readHiringPostFeed()),
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
    return {
      configured: false,
      source: "development-fixture",
      error: null,
      feed: mergeHiringPostFeed(emptyHiringPostFeed(), posts, {
        runId: "development-fixture",
        rawCount: fixture.length,
        now,
      }),
    };
  }

  return {
    configured: false,
    source: "empty",
    error: null,
    feed: emptyHiringPostFeed(),
  };
}
