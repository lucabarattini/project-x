import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredViewKey,
  hiringPostsViewerCookieValue,
  isHiringPostsViewingConfigured,
  matchesHiringPostsViewerCookie,
  matchesHiringPostsViewKey,
  viewerToken,
} from "./view-key";

function withViewKey<T>(value: string | undefined, run: () => T) {
  const previous = process.env.HIRING_POSTS_VIEW_KEY;
  if (value === undefined) delete process.env.HIRING_POSTS_VIEW_KEY;
  else process.env.HIRING_POSTS_VIEW_KEY = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.HIRING_POSTS_VIEW_KEY;
    else process.env.HIRING_POSTS_VIEW_KEY = previous;
  }
}

test("hiring signals stay locked when no view key is configured", () => {
  withViewKey(undefined, () => {
    assert.equal(isHiringPostsViewingConfigured(), false);
    assert.equal(matchesHiringPostsViewKey("anything"), false);
    assert.equal(matchesHiringPostsViewerCookie("anything"), false);
    // An empty configured key must never be satisfied by an empty presentation.
    assert.equal(matchesHiringPostsViewKey(""), false);
    assert.equal(matchesHiringPostsViewerCookie(""), false);
  });
});

test("a blank or whitespace view key does not count as configured", () => {
  withViewKey("   ", () => {
    assert.equal(isHiringPostsViewingConfigured(), false);
    assert.equal(matchesHiringPostsViewKey("   "), false);
  });
});

test("the view key unlocks only on an exact match", () => {
  withViewKey("s3cret-view-key", () => {
    assert.equal(isHiringPostsViewingConfigured(), true);
    assert.equal(configuredViewKey(), "s3cret-view-key");
    assert.equal(matchesHiringPostsViewKey("s3cret-view-key"), true);
    assert.equal(matchesHiringPostsViewKey("s3cret-view-ke"), false);
    assert.equal(matchesHiringPostsViewKey("s3cret-view-keyy"), false);
    assert.equal(matchesHiringPostsViewKey("S3CRET-VIEW-KEY"), false);
    assert.equal(matchesHiringPostsViewKey(null), false);
  });
});

test("the viewer cookie carries a digest, never the key itself", () => {
  withViewKey("s3cret-view-key", () => {
    const cookie = hiringPostsViewerCookieValue();
    assert.notEqual(cookie, "s3cret-view-key");
    assert.match(cookie, /^[0-9a-f]{64}$/u);
    assert.equal(cookie, viewerToken("s3cret-view-key"));
    assert.equal(matchesHiringPostsViewerCookie(cookie), true);
    // The raw key must not work as a cookie, and vice versa.
    assert.equal(matchesHiringPostsViewerCookie("s3cret-view-key"), false);
    assert.equal(matchesHiringPostsViewKey(cookie), false);
  });
});

test("a cookie minted from an old key stops working once the key rotates", () => {
  const stale = withViewKey("old-key", hiringPostsViewerCookieValue);
  withViewKey("new-key", () => {
    assert.equal(matchesHiringPostsViewerCookie(stale), false);
    assert.equal(matchesHiringPostsViewerCookie(hiringPostsViewerCookieValue()), true);
  });
});
