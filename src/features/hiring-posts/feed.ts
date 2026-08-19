import { normalizedContentBody, normalizedContentFingerprint } from "./normalize";
import type { HiringPost, HiringPostFeed } from "./types";

const retentionMs = 7 * 24 * 60 * 60 * 1000;

export function emptyHiringPostFeed(): HiringPostFeed {
  return {
    version: 1,
    updatedAt: null,
    lastRunId: null,
    ingestedRunIds: [],
    rawItemsSeen: 0,
    posts: [],
  };
}

function withinRetention(post: HiringPost, now: Date) {
  const timestamp = Date.parse(post.postedAt);
  if (Number.isNaN(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= -5 * 60 * 1000 && age <= retentionMs;
}

function preferIncoming(existing: HiringPost, incoming: HiringPost): HiringPost {
  const preferred = incoming.score > existing.score
    || (incoming.score === existing.score
      && Date.parse(incoming.postedAt) >= Date.parse(existing.postedAt))
    ? incoming
    : existing;
  const other = preferred === incoming ? existing : incoming;
  const author = preferred.author.imageUrl
    ? preferred.author
    : { ...preferred.author, imageUrl: other.author.imageUrl };
  return {
    ...preferred,
    author,
    sourcePostIds: [...new Set([...existing.sourcePostIds, ...incoming.sourcePostIds])],
    firstSeenAt: Date.parse(existing.firstSeenAt) <= Date.parse(incoming.firstSeenAt)
      ? existing.firstSeenAt
      : incoming.firstSeenAt,
    lastSeenAt: Date.parse(existing.lastSeenAt) >= Date.parse(incoming.lastSeenAt)
      ? existing.lastSeenAt
      : incoming.lastSeenAt,
  };
}

export function consolidateHiringPosts(postsToConsolidate: HiringPost[], now = new Date()) {
  const byId = new Map<string, HiringPost>();
  for (const post of postsToConsolidate) {
    if (!withinRetention(post, now)) continue;
    const existing = byId.get(post.id);
    byId.set(post.id, existing ? preferIncoming(existing, post) : post);
  }

  const byFingerprint = new Map<string, HiringPost>();
  for (const post of byId.values()) {
    const fingerprint = normalizedContentFingerprint(post);
    const existing = fingerprint.endsWith("::") ? undefined : byFingerprint.get(fingerprint);
    byFingerprint.set(fingerprint, existing ? preferIncoming(existing, post) : post);
  }

  const byCampaign = new Map<string, HiringPost>();
  for (const post of byFingerprint.values()) {
    const body = normalizedContentBody(post);
    const campaignKey = post.contactType === "employee-share" && body.length >= 120
      ? `employee-campaign::${body}`
      : `post::${post.id}`;
    const existing = byCampaign.get(campaignKey);
    byCampaign.set(campaignKey, existing ? preferIncoming(existing, post) : post);
  }

  return [...byCampaign.values()].sort((left, right) => {
    if (left.matchStatus !== right.matchStatus) {
      const order = { match: 0, review: 1, excluded: 2 };
      return order[left.matchStatus] - order[right.matchStatus];
    }
    if (left.score !== right.score) return right.score - left.score;
    return Date.parse(right.postedAt) - Date.parse(left.postedAt);
  });
}

export function mergeHiringPostFeed(
  current: HiringPostFeed,
  incomingPosts: HiringPost[],
  options: { runId: string; rawCount: number; now?: Date },
) {
  const now = options.now ?? new Date();
  if (current.ingestedRunIds.includes(options.runId)) {
    return current;
  }

  const posts = consolidateHiringPosts([...current.posts, ...incomingPosts], now);

  return {
    version: 1 as const,
    updatedAt: now.toISOString(),
    lastRunId: options.runId,
    ingestedRunIds: [...current.ingestedRunIds, options.runId].slice(-50),
    rawItemsSeen: current.rawItemsSeen + options.rawCount,
    posts,
  };
}
