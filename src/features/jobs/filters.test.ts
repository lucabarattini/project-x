import test from "node:test";
import assert from "node:assert/strict";
import {
  isToday,
  isWithinLast,
  matchesDate,
  matchesCompany,
  matchesCountry,
  matchesLocation,
  remoteUsLocation,
  seattleAreaLocation,
} from "./filters.ts";

const now = new Date("2026-08-05T15:30:00.000Z");

test("isToday only matches the same calendar day", () => {
  assert.equal(isToday("2026-08-05T16:00:00.000Z", now), true);
  assert.equal(isToday("2026-08-04T23:59:59.000Z", now), false);
  assert.equal(isToday(null, now), false);
});

test("relative published filters support hours and multiple day ranges", () => {
  const fiveHoursAgo = "2026-08-05T10:30:00.000Z";
  const elevenHoursAgo = "2026-08-05T04:30:00.000Z";
  const thirtyHoursAgo = "2026-08-04T09:30:00.000Z";
  const tenDaysAgo = "2026-07-26T15:30:00.000Z";

  assert.equal(matchesDate(fiveHoursAgo, "6h", now), true);
  assert.equal(matchesDate(elevenHoursAgo, "6h", now), false);
  assert.equal(matchesDate(elevenHoursAgo, "12h", now), true);
  assert.equal(matchesDate(thirtyHoursAgo, "24h", now), false);
  assert.equal(matchesDate(thirtyHoursAgo, "48h", now), true);
  assert.equal(matchesDate(thirtyHoursAgo, "3d", now), true);
  assert.equal(matchesDate(tenDaysAgo, "week", now), false);
  assert.equal(matchesDate(tenDaysAgo, "2w", now), true);
  assert.equal(isWithinLast("2026-08-06T10:00:00.000Z", 48 * 60 * 60 * 1000, now), false);
});

test("matchesCountry defaults to U.S. based jobs", () => {
  assert.equal(matchesCountry("New York, NY", "us"), true);
  assert.equal(matchesCountry("United States", "us"), true);
  assert.equal(matchesCountry("San Francisco Bay Area", "us"), true);
  assert.equal(matchesCountry("London, UK", "us"), false);
  assert.equal(matchesCountry("London, UK", "all"), true);
});

test("the Seattle area preset covers the Eastside and Washington, not D.C.", () => {
  for (const location of ["Seattle, WA", "Redmond, Washington, United States", "USA - Bellevue, WA", "Kirkland, WA, US", "SF, SEA, CHI, NYC"]) {
    assert.equal(matchesLocation(location, [seattleAreaLocation]), true, location);
  }
  for (const location of ["Washington, D.C", "Washington DC", "New York, NY", "Portland, OR"]) {
    assert.equal(matchesLocation(location, [seattleAreaLocation]), false, location);
  }
});

test("the Remote (US) preset keeps U.S.-open remote roles only", () => {
  for (const location of ["Remote", "Remote (US)", "US - Remote", "Canada / US / Europe; North America remote", "Remote - New York"]) {
    assert.equal(matchesLocation(location, [remoteUsLocation]), true, location);
  }
  for (const location of ["Remote (EMEA)", "UK - Remote", "India (Remote)", "San Francisco, CA"]) {
    assert.equal(matchesLocation(location, [remoteUsLocation]), false, location);
  }
});

test("presets combine with OR, so Seattle area plus remote is one search", () => {
  const selected = [seattleAreaLocation, remoteUsLocation];
  assert.equal(matchesLocation("Bellevue, WA", selected), true);
  assert.equal(matchesLocation("Remote (US)", selected), true);
  assert.equal(matchesLocation("Austin, TX", selected), false);
});

test("the U.S. country default keeps state-coded and U.S.-remote postings", () => {
  assert.equal(matchesCountry("Austin, TX", "us"), true);
  assert.equal(matchesCountry("Bellevue, WA", "us"), true);
  assert.equal(matchesCountry("Remote", "us"), true);
  assert.equal(matchesCountry("Remote (EMEA)", "us"), false);
  assert.equal(matchesCountry("London, UK", "us"), false);
});

test("matchesCompany filters by exact company name", () => {
  assert.equal(matchesCompany("Stripe", null), true);
  assert.equal(matchesCompany("Stripe", "Stripe"), true);
  assert.equal(matchesCompany("Stripe", "Airbnb"), false);
});

