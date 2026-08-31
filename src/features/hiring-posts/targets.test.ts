import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLinkedinPostSearchInput,
  findHiringPostCompanyBatchIndex,
  hiringPostCompanyBatches,
  hiringPostCompanyCycleHours,
  hiringPostMaxCompaniesPerBatch,
  hiringPostScanCadenceHours,
  nextHiringPostCompanyBatchIndex,
  projectedMonthlyPostMaximum,
} from "./search-config";
import {
  companyFromHiringUrl,
  companyMentionInText,
  hiringPostCompanies,
  normalizeCompanyComparable,
} from "./targets";

test("derives every hiring-post company from the configured job boards", () => {
  assert.equal(hiringPostCompanies.length, 90);
  assert.ok(hiringPostCompanies.includes("Amazon"));
  assert.ok(hiringPostCompanies.includes("DoorDash"));
  assert.ok(hiringPostCompanies.includes("Google"));
  assert.ok(hiringPostCompanies.includes("OpenAI"));
  assert.ok(hiringPostCompanies.includes("Jane Street"));
  assert.ok(hiringPostCompanies.includes("Microsoft"));
  assert.ok(hiringPostCompanies.includes("Zillow"));
});

test("normalizes casing, punctuation, and stylized Unicode company names", () => {
  assert.equal(normalizeCompanyComparable("𝙂𝙊𝙊𝙂𝙇𝙀"), "google");
  assert.equal(companyMentionInText("Director at AMAZON"), "Amazon");
  assert.equal(companyMentionInText("Product lead @ open ai"), "OpenAI");
});

test("maps known career URLs back to their companies", () => {
  assert.equal(
    companyFromHiringUrl("https://jobs.ashbyhq.com/abridge/abc123"),
    "Abridge",
  );
  assert.equal(
    companyFromHiringUrl("https://www.amazon.jobs/en/jobs/123/program-manager"),
    "Amazon",
  );
});

test("rotates every company through bounded Apify inputs", () => {
  const input = buildLinkedinPostSearchInput();
  const secondInput = buildLinkedinPostSearchInput("24h", 10, 1);
  assert.equal(input.searchQueries.length, 3);
  assert.ok(input.searchQueries[0].length > 20, "generic hiring query present");
  assert.ok(input.searchQueries[1].includes("engineer"), "technical query present");
  assert.ok(input.searchQueries[2].includes("account executive"), "non-technical query present");
  // IC finance titles had no query of their own, so "Financial Analyst" never
  // surfaced while manager-level finance roles did. maxPosts is per query, so
  // these ride the business family's existing, under-used budget.
  assert.ok(input.searchQueries[2].includes("financial analyst"), "finance IC query present");
  assert.ok(input.searchQueries[2].includes("hiring an analyst"), "generic analyst query present");
  assert.equal(input.searchQueries.length, 3, "still three query families - no extra per-query budget");
  assert.ok(hiringPostCompanyBatches.every((batch) => (
    batch.length <= hiringPostMaxCompaniesPerBatch
  )));
  assert.deepEqual(
    hiringPostCompanyBatches.flat().sort((left, right) => left.localeCompare(right)),
    hiringPostCompanies,
  );
  assert.deepEqual(input.authorsCompanies, hiringPostCompanyBatches[0]);
  assert.deepEqual(secondInput.authorsCompanies, hiringPostCompanyBatches[1]);
  assert.equal(findHiringPostCompanyBatchIndex(input.authorsCompanies), 0);
  assert.equal(nextHiringPostCompanyBatchIndex(input.authorsCompanies), 1);
  assert.equal(nextHiringPostCompanyBatchIndex(["Amazon", "Google"]), 0);
  assert.equal(input.postedLimit, "24h");
  assert.equal(input.maxPosts, 10);
  assert.equal(hiringPostCompanyBatches.length, 6);
  assert.equal(hiringPostCompanyCycleHours, 24);
  assert.equal(projectedMonthlyPostMaximum(31), 5_580);
  assert.ok(projectedMonthlyPostMaximum(31) < 6_000);
});

test("the batch rotation tiles the postedLimit window exactly", () => {
  // The rotation cycle and the 24h postedLimit window have to match. A shorter
  // cycle re-fetches — and re-pays for — the overlap on every pass; a longer one
  // leaves a gap whose posts are never seen. This pins the sizing that keeps
  // hiringPostMaxCompaniesPerBatch honest as the company list grows.
  assert.equal(hiringPostCompanyCycleHours, 24);
  assert.equal(buildLinkedinPostSearchInput().postedLimit, "24h");
  assert.equal(
    hiringPostCompanyBatches.length * hiringPostScanCadenceHours,
    hiringPostCompanyCycleHours,
  );
});
