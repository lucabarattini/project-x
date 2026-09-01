import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
  hiringPostExcludedCompanies,
  normalizeCompanyComparable,
} from "./targets";

test("derives every hiring-post company from the configured job boards", () => {
  // 93 catalogued companies, less the one deliberately kept out of the feed.
  assert.equal(hiringPostCompanies.length, 92);
  assert.ok(hiringPostCompanies.includes("Amazon"));
  assert.ok(hiringPostCompanies.includes("DoorDash"));
  assert.ok(hiringPostCompanies.includes("Google"));
  assert.ok(hiringPostCompanies.includes("OpenAI"));
  assert.ok(hiringPostCompanies.includes("Jane Street"));
  assert.ok(hiringPostCompanies.includes("Microsoft"));
  assert.ok(hiringPostCompanies.includes("Apple"));
  assert.ok(hiringPostCompanies.includes("Meta"));
  assert.ok(hiringPostCompanies.includes("Expedia Group"));
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

function catalogedCompanies() {
  const catalogDir = new URL("../../../data/", import.meta.url);
  const catalogs = readdirSync(catalogDir).filter((name) => name.endsWith("-boards.json"));
  assert.ok(catalogs.length > 0, "no board catalogs found");
  return catalogs.flatMap((name) => {
    const entries = JSON.parse(readFileSync(new URL(name, catalogDir), "utf8"));
    return entries.map((entry: { company: string }) => ({ company: entry.company, name }));
  }) as Array<{ company: string; name: string }>;
}

test("every board catalog on disk reaches the hiring-post target list", () => {
  // Four catalogs were on disk and never imported, so their companies were
  // billed by the Actor and dropped at normalization. Read the directory
  // rather than a hand-kept list, so the next catalog cannot be forgotten.
  //
  // The one legitimate way to be absent is hiringPostExcludedCompanies, which
  // the assertion below holds to the same standard: a name in that set has to
  // exist on disk, so the exclusion stays a deliberate subtraction from a real
  // catalog rather than a leftover nobody can trace.
  const tracked = new Set(hiringPostCompanies);
  const missing = catalogedCompanies()
    .filter(({ company }) => !tracked.has(company) && !hiringPostExcludedCompanies.has(company))
    .map(({ company, name }) => `${company} (${name})`);
  assert.deepEqual(missing, []);
});

test("the signals-only exclusion keeps its companies in the portal catalogs", () => {
  const onDisk = new Set(catalogedCompanies().map(({ company }) => company));
  for (const company of hiringPostExcludedCompanies) {
    assert.ok(
      onDisk.has(company),
      `${company} is excluded from hiring signals but no longer on any board — delete the exclusion`,
    );
    assert.ok(
      !hiringPostCompanies.includes(company),
      `${company} is excluded from hiring signals but still a search target`,
    );
  }
});

test("Mercor stays a job-portal company and stops being a hiring-signal one", () => {
  // Mercor must disappear from the feed without disappearing from the portal,
  // and the portal reads the same catalog this asserts is untouched.
  const ashby = JSON.parse(readFileSync(
    new URL("../../../data/ashby-boards.json", import.meta.url),
    "utf8",
  )) as Array<{ company: string }>;
  assert.ok(ashby.some((board) => board.company === "Mercor"), "Mercor left the Ashby catalog");
  assert.ok(hiringPostExcludedCompanies.has("Mercor"));
  assert.ok(!hiringPostCompanies.includes("Mercor"));
  // Attribution has to agree with the target list, or a post linking to a
  // Mercor job would still be filed under a company the feed does not track.
  assert.equal(companyFromHiringUrl("https://jobs.ashbyhq.com/mercor/abc123"), null);
  assert.equal(companyMentionInText("Recruiter at Mercor"), null);
});
