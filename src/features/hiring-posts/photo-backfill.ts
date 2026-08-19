import { loadEnvConfig } from "@next/env";

/**
 * Backfills author profile photos into the persisted hiring-signal feed from
 * the raw datasets of recent Apify runs. The LinkedIn Post Search actor
 * returns author.avatar.url; posts ingested before that field was mapped (or
 * re-ingested by an older deployment that drops it) have no photo and would
 * otherwise wait for the next rotation cycle.
 *
 * Cheap when healthy: it reads the feed once and skips the run scans entirely
 * when every post already has a photo.
 */

type RawItem = {
  id?: string | null;
  author?: {
    avatar?: { url?: string | null } | null;
  } | null;
};

type FeedPost = {
  id: string;
  sourcePostIds?: string[];
  author: {
    name: string;
    headline: string;
    linkedinUrl: string | null;
    imageUrl: string | null;
  };
  [key: string]: unknown;
};

type FeedRecord = {
  version: number;
  posts: FeedPost[];
  ingestedRunIds: string[];
  lastRunId: string | null;
  [key: string]: unknown;
};

export async function backfillAuthorPhotos(): Promise<{ scannedRuns: number; patched: number }> {
  const token = process.env.APIFY_TOKEN?.trim();
  const storeId = process.env.APIFY_STORE_ID?.trim();
  if (!token || !storeId) {
    return { scannedRuns: 0, patched: 0 };
  }

  const feedKey = "HIRING_POSTS_FEED";
  const headers = { authorization: `Bearer ${token}` };

  const feedResponse = await fetch(
    `https://api.apify.com/v2/key-value-stores/${encodeURIComponent(storeId)}/records/${feedKey}`,
    { cache: "no-store", headers },
  );
  if (!feedResponse.ok) throw new Error(`Feed read failed: ${feedResponse.status}`);
  const feed = await feedResponse.json() as FeedRecord;
  if (!Array.isArray(feed.posts)) throw new Error("Feed record has an unsupported shape");

  const missing = feed.posts.filter((post) => !post.author?.imageUrl);
  if (missing.length === 0) {
    return { scannedRuns: 0, patched: 0 };
  }

  const runIds = [
    ...new Set([...(feed.ingestedRunIds ?? []), ...(feed.lastRunId ? [feed.lastRunId] : [])]),
  ].slice(-10);

  const avatarByPostId = new Map<string, string>();
  for (const runId of runIds) {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?clean=true&format=json`,
        { cache: "no-store", headers },
      );
      if (!response.ok) continue;
      const items = await response.json() as RawItem[];
      for (const item of items) {
        const url = item.author?.avatar?.url?.trim();
        if (item.id && url) avatarByPostId.set(item.id, url);
      }
    } catch {
      // A run whose dataset already expired is skipped; the next rotation
      // cycle will pick up fresh photos instead.
    }
  }

  let patched = 0;
  for (const post of feed.posts) {
    const postId = post.sourcePostIds?.[0] ?? post.id;
    const url = avatarByPostId.get(postId);
    if (url && !post.author.imageUrl) {
      post.author.imageUrl = url;
      patched += 1;
    }
  }
  if (patched === 0) return { scannedRuns: runIds.length, patched: 0 };

  await fetch(
    `https://api.apify.com/v2/key-value-stores/${encodeURIComponent(storeId)}/records/${feedKey}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: { ...headers, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(feed),
    },
  );

  return { scannedRuns: runIds.length, patched };
}

export async function runPhotoBackfillFromEnv() {
  if (typeof process !== "undefined" && process.env) {
    loadEnvConfig(process.cwd());
  }
  return backfillAuthorPhotos();
}
