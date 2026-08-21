import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchEntry, mergeSearchEntries, type JobSearchEntry } from "./search-model";
import type { GreenhouseJob } from "./providers/greenhouse";

function job(overrides: Partial<GreenhouseJob> = {}): GreenhouseJob {
  return {
    id: "amz-1",
    title: "Financial Analyst II",
    company: "Amazon",
    boardToken: "amazon-usa",
    location: "Seattle, Washington, USA",
    absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-1",
    contentText: "Required Qualifications: 4+ years of experience in finance.",
    postedAt: "2026-08-19T12:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

function entry(jobOverride: Partial<GreenhouseJob> = {}): JobSearchEntry {
  return buildSearchEntry(job(jobOverride));
}

test("mergeSearchEntries returns the base unchanged when extra is empty", () => {
  const base = [entry()];
  assert.equal(mergeSearchEntries(base, []), base);
});

test("mergeSearchEntries appends non-duplicate entries", () => {
  const base = [entry()];
  const extra = [
    entry({ id: "amz-2", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-2" }),
    entry({ id: "amz-3", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-3" }),
  ];
  const merged = mergeSearchEntries(base, extra);
  assert.equal(merged.length, 3);
});

test("mergeSearchEntries drops entries already present by board token + id", () => {
  const base = [entry()];
  const extra = [
    entry(), // same id + url as base
    entry({ id: "amz-4", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-4" }),
  ];
  const merged = mergeSearchEntries(base, extra);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].job.id, "amz-1");
  assert.equal(merged[1].job.id, "amz-4");
});

test("mergeSearchEntries drops entries duplicated by absolute URL only", () => {
  const base = [entry()];
  const extra = [
    entry({ id: "different-req-id", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-1" }),
  ];
  const merged = mergeSearchEntries(base, extra);
  assert.equal(merged.length, 1);
});

test("mergeSearchEntries dedupes within the extra set", () => {
  const base: JobSearchEntry[] = [];
  const extra = [
    entry({ id: "amz-9", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-9" }),
    entry({ id: "amz-9", absoluteUrl: "https://www.amazon.jobs/en/jobs/amz-9" }),
  ];
  const merged = mergeSearchEntries(base, extra);
  assert.equal(merged.length, 1);
});
