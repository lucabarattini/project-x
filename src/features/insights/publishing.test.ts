import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublishingInsights,
  easternDateKey,
  publishingSpotlightCompanies,
} from "./publishing.ts";

test("easternDateKey groups late UTC posts into the correct Eastern day", () => {
  assert.equal(easternDateKey("2026-08-06T03:30:00.000Z"), "2026-08-05");
  assert.equal(easternDateKey("2026-08-06T04:30:00.000Z"), "2026-08-06");
});

test("buildPublishingInsights counts current open postings by day and spotlight company", () => {
  const insights = buildPublishingInsights(
    [
      { company: "Google", postedAt: "2026-08-06T14:00:00.000Z" },
      { company: "Google", postedAt: "2026-08-05T20:00:00.000Z" },
      { company: "Amazon", postedAt: "2026-08-05T18:00:00.000Z" },
      { company: "OpenAI", postedAt: "2026-08-04T18:00:00.000Z" },
      { company: "Other Company", postedAt: "2026-08-06T15:00:00.000Z" },
      { company: "Google", postedAt: "2026-08-03T15:00:00.000Z" },
      { company: "Amazon", postedAt: null },
    ],
    "2026-08-06T20:00:00.000Z",
    3,
  );

  assert.deepEqual(insights.days.map((day) => day.date), [
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
  ]);
  assert.deepEqual(insights.days.map((day) => day.total), [1, 2, 1]);
  assert.equal(insights.spotlightTotal, 4);
  assert.equal(insights.allCompaniesTotal, 5);
  assert.equal(insights.busiestDay?.date, "2026-08-05");
  assert.equal(insights.companies[0].company, "Google");
  assert.equal(insights.companies[0].total, 2);
  assert.deepEqual(
    new Set(insights.companies.map((company) => company.company)),
    new Set(publishingSpotlightCompanies),
  );
});
