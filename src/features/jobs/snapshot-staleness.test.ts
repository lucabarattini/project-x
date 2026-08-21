import assert from "node:assert/strict";
import test from "node:test";

/**
 * Mirrors the staleness rule in service.ts. Kept as a standalone unit so the
 * boundary is pinned without importing the provider-fetching module.
 */
const snapshotMaxStaleMs = 30 * 60 * 1000;
function isStaleBeyondLimit(fetchedAt: string, now = Date.now()) {
  const age = now - Date.parse(fetchedAt);
  return Number.isNaN(age) || age > snapshotMaxStaleMs;
}

const now = Date.parse("2026-08-20T18:42:00.000Z");

test("a snapshot inside the staleness ceiling is served as-is", () => {
  assert.equal(isStaleBeyondLimit("2026-08-20T18:40:00.000Z", now), false);
  assert.equal(isStaleBeyondLimit("2026-08-20T18:13:00.000Z", now), false);
});

test("a snapshot past the ceiling is refused", () => {
  assert.equal(isStaleBeyondLimit("2026-08-20T18:11:00.000Z", now), true);
  // The exact regression: a day-old snapshot rendering as "no roles today".
  assert.equal(isStaleBeyondLimit("2026-08-19T17:50:00.000Z", now), true);
});

test("an unparseable timestamp is treated as stale rather than trusted", () => {
  assert.equal(isStaleBeyondLimit("not-a-date", now), true);
  assert.equal(isStaleBeyondLimit("", now), true);
});
