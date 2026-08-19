import test from "node:test";
import assert from "node:assert/strict";
import { parseAmazonPostedDate, parseAmazonUpdatedTime } from "./amazon.ts";

test("parseAmazonPostedDate parses Amazon posted_date values", () => {
  assert.equal(
    parseAmazonPostedDate("June 12, 2026"),
    "2026-06-12T12:00:00.000Z",
  );
  assert.equal(parseAmazonPostedDate(undefined), null);
  assert.equal(parseAmazonPostedDate("not a date"), null);
});

test("parseAmazonUpdatedTime converts provider-relative update values", () => {
  const now = new Date("2026-08-06T16:00:00.000Z");
  assert.equal(
    parseAmazonUpdatedTime("about 4 hours", now),
    "2026-08-06T12:00:00.000Z",
  );
  assert.equal(
    parseAmazonUpdatedTime("2 days", now),
    "2026-08-04T16:00:00.000Z",
  );
  assert.equal(parseAmazonUpdatedTime(undefined, now), null);
});
