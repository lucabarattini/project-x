import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLinkedinPostSearchInput,
  findHiringPostCompanyBatchIndex,
  hiringPostCompanyBatches,
  hiringPostCompanyCycleHours,
  hiringPostMaxCompaniesPerBatch,
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
  assert.equal(hiringPostCompanies.length, 87);
  assert.ok(hiringPostCompanies.includes("Amazon"));
  assert.ok(hiringPostCompanies.includes("Google"));
  assert.ok(hiringPostCompanies.includes("OpenAI"));
  assert.ok(hiringPostCompanies.includes("Jane Street"));
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

test("rotates every company through Apify inputs of no more than twenty", () => {
  const input = buildLinkedinPostSearchInput();
  const secondInput = buildLinkedinPostSearchInput("24h", 10, 1);
  assert.equal(input.searchQueries.length, 3);
  assert.ok(input.searchQueries[0].length > 20, "generic hiring query present");
  assert.ok(input.searchQueries[1].includes("engineer"), "technical query present");
  assert.ok(input.searchQueries[2].includes("account executive"), "non-technical query present");
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
  assert.equal(hiringPostCompanyBatches.length, 5);
  assert.equal(hiringPostCompanyCycleHours, 20);
  assert.equal(projectedMonthlyPostMaximum(31), 5_580);
  assert.ok(projectedMonthlyPostMaximum(31) < 6_000);
});
