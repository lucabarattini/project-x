import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Hiring signals are personal data: a named person, their photo, their profile
 * URL and the text they wrote. They are private by default, so a clone of this
 * repo — or a deploy whose owner has not opted in — serves the locked state and
 * never the feed. Set HIRING_POSTS_VIEW_KEY to unlock it for yourself.
 *
 * Kept free of `server-only` and `next/headers` so the rules stay unit-testable;
 * the request-bound wrapper lives in ./access.
 */
export const hiringPostsViewerCookie = "hiring_posts_viewer";

/** A month, so the unlock survives normal use without becoming permanent. */
export const hiringPostsViewerMaxAge = 60 * 60 * 24 * 30;

export function configuredViewKey() {
  return process.env.HIRING_POSTS_VIEW_KEY?.trim() ?? "";
}

/**
 * The cookie carries a digest rather than the key itself, so a stolen cookie
 * jar does not hand over a credential that also works as a URL parameter.
 */
export function viewerToken(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function constantTimeEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isHiringPostsViewingConfigured() {
  return configuredViewKey().length > 0;
}

export function matchesHiringPostsViewKey(candidate: string | null | undefined) {
  const expected = configuredViewKey();
  if (!expected || !candidate) return false;
  return constantTimeEquals(candidate, expected);
}

export function hiringPostsViewerCookieValue() {
  return viewerToken(configuredViewKey());
}

/** True only when the presented cookie was minted from the configured key. */
export function matchesHiringPostsViewerCookie(presented: string | null | undefined) {
  const expected = configuredViewKey();
  if (!expected || !presented) return false;
  return constantTimeEquals(presented, viewerToken(expected));
}
