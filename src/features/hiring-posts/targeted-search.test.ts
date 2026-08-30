import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTargetedPostSearchInput,
  outreachSearchQueries,
  targetedSearchMaxPostsCeiling,
  targetedSearchResultCeiling,
  untrackedCompanies,
} from "./targeted-search";
import { buildLinkedinPostSearchInput } from "./search-config";

test("a targeted input carries the requested companies, not a rotation batch", () => {
  const input = buildTargetedPostSearchInput({ companies: ["DoorDash", "Anthropic"] });
  assert.deepEqual(input.authorsCompanies, ["DoorDash", "Anthropic"]);
  assert.equal(input.searchQueries.length, outreachSearchQueries.length);
  assert.equal(input.postedLimit, "week");

  // The scheduled rotation must be reachable only through its own builder:
  // a targeted run that happened to reproduce a batch would make the two
  // indistinguishable to findHiringPostCompanyBatchIndex.
  const scheduled = buildLinkedinPostSearchInput("24h", 10, 0);
  assert.notDeepEqual(input.authorsCompanies, scheduled.authorsCompanies);
  assert.notDeepEqual(input.searchQueries, scheduled.searchQueries);
});

test("maxPosts is clamped, because Apify bills per result", () => {
  assert.equal(buildTargetedPostSearchInput({ companies: ["Amazon"], maxPosts: 9999 }).maxPosts,
    targetedSearchMaxPostsCeiling);
  assert.equal(buildTargetedPostSearchInput({ companies: ["Amazon"], maxPosts: 0 }).maxPosts, 1);
  assert.equal(buildTargetedPostSearchInput({ companies: ["Amazon"], maxPosts: 7.9 }).maxPosts, 7);
});

test("an empty search is refused rather than billed", () => {
  assert.throws(() => buildTargetedPostSearchInput({ companies: [] }), /at least one company/u);
  assert.throws(
    () => buildTargetedPostSearchInput({ companies: ["Amazon"], queries: [] }),
    /at least one query/u,
  );
});

test("untracked companies are reported before a run, not after the bill", () => {
  // A company absent from the board list cannot be attributed, so its posts
  // are dropped at normalization — the run is billed and thrown away.
  assert.deepEqual(untrackedCompanies(["Amazon", "DoorDash"]), []);
  assert.deepEqual(untrackedCompanies(["Amazon", "Nonesuch Inc"]), ["Nonesuch Inc"]);
});

test("the result ceiling multiplies per query, matching how maxPosts is applied", () => {
  assert.equal(targetedSearchResultCeiling(2, 25), 50);
});
