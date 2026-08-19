import test from "node:test";
import assert from "node:assert/strict";
import {
  filterJobs,
  isToday,
  isWithinLast,
  isWithinLastWeek,
  matchesDate,
  matchesCompany,
  matchesCountry,
  sortJobs,
} from "./filters.ts";
import type { GreenhouseJob } from "./providers/greenhouse.ts";

const now = new Date("2026-08-05T15:30:00.000Z");

const jobs: GreenhouseJob[] = [
  {
    id: 1,
    title: "Software Engineer",
    company: "Acme",
    boardToken: "acme",
    location: "New York, NY",
    absoluteUrl: "https://example.com/1",
    contentText: "Requires 1+ years of experience building software.",
    postedAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
  },
  {
    id: 2,
    title: "ML Engineer",
    company: "Acme",
    boardToken: "acme",
    location: "Seattle, WA",
    absoluteUrl: "https://example.com/2",
    contentText: "Requires 2+ years of experience with ML systems.",
    postedAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
  {
    id: 3,
    title: "Product Engineer",
    company: "Acme",
    boardToken: "acme",
    location: "London, UK",
    absoluteUrl: "https://example.com/3",
    contentText: "Requires 6+ years of product engineering experience.",
    postedAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
  },
];

test("isToday only matches the same calendar day", () => {
  assert.equal(isToday("2026-08-05T16:00:00.000Z", now), true);
  assert.equal(isToday("2026-08-04T23:59:59.000Z", now), false);
  assert.equal(isToday(null, now), false);
});

test("isWithinLastWeek includes jobs from the last seven days only", () => {
  assert.equal(isWithinLastWeek("2026-08-02T10:00:00.000Z", now), true);
  assert.equal(isWithinLastWeek("2026-07-20T10:00:00.000Z", now), false);
  assert.equal(isWithinLastWeek("2026-08-06T10:00:00.000Z", now), false);
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

test("filterJobs filters by selected locations", () => {
  assert.deepEqual(
    filterJobs(jobs, ["New York", "Seattle"], "all", "all", ["all"], "all", null, now).map(
      (job) => job.id,
    ),
    [1, 2],
  );
});

test("filterJobs combines location and date filters", () => {
  assert.deepEqual(
    filterJobs(jobs, ["Seattle"], "today", "all", ["all"], "all", null, now).map((job) => job.id),
    [],
  );

  assert.deepEqual(
    filterJobs(jobs, ["Seattle"], "week", "all", ["all"], "all", null, now).map((job) => job.id),
    [2],
  );
});

test("filterJobs applies the early and senior experience filters", () => {
  assert.deepEqual(
    filterJobs(jobs, ["New York", "Seattle"], "all", "early", ["all"], "all", null, now).map(
      (job) => job.id,
    ),
    [1, 2],
  );

  assert.deepEqual(
    filterJobs(jobs, [], "all", "senior", ["all"], "all", null, now).map((job) => job.id),
    [3],
  );
});

test("filterJobs accepts multiple experience groups together", () => {
  const mixedExperienceJobs = [
    jobs[0],
    { ...jobs[0], id: 10, title: "Data Engineer", contentText: "Experience is not stated." },
    { ...jobs[0], id: 11, title: "ML Engineer", contentText: "Requires 2 years. Requires 5 years." },
    { ...jobs[0], id: 12, title: "Principal Data Engineer", contentText: "Experience is not stated." },
  ];

  assert.deepEqual(
    filterJobs(
      mixedExperienceJobs,
      [],
      "all",
      ["early", "not_stated", "conflicting"],
      ["all"],
      "all",
      null,
      now,
    ).map((job) => job.id),
    [1, 10, 11],
  );
});

test("filterJobs default technical tracks exclude senior titles and Needs Review", () => {
  const mixedJobs = [
    {
      ...jobs[0],
      id: 20,
      title: "Software Engineer",
      contentText: "Requires 2 years of experience.",
    },
    {
      ...jobs[0],
      id: 21,
      title: "Senior Software Engineer",
      contentText: "Requires 2 years of experience.",
    },
    {
      ...jobs[0],
      id: 22,
      title: "Engineering Manager",
      contentText: "Requires 2 years of experience.",
    },
    {
      ...jobs[0],
      id: 23,
      title: "Account Executive",
      contentText: "Requires 2 years of experience.",
    },
  ];

  assert.deepEqual(
    filterJobs(mixedJobs, [], "all", "early", ["Software Engineering"], "all", null, now).map(
      (job) => job.id,
    ),
    [20],
  );
});

test("filterJobs applies technical family filters", () => {
  assert.deepEqual(
    filterJobs(jobs, [], "all", "all", ["Machine Learning Engineering"], "all", null, now).map(
      (job) => job.id,
    ),
    [2],
  );
});

test("filterJobs exposes unclassified roles through the Needs Review track", () => {
  const needsReviewJob = {
    ...jobs[0],
    id: 41,
    title: "Localization Specialist",
  };

  assert.deepEqual(
    filterJobs(
      [needsReviewJob],
      [],
      "all",
      "all",
      ["Needs Review"],
      "all",
      null,
      now,
    ).map((job) => job.id),
    [41],
  );
});

test("security roles can be kept outside a chosen default track set", () => {
  const securityJob = {
    ...jobs[0],
    id: 40,
    title: "Security Engineer, Corporate Services Security",
  };

  assert.deepEqual(
    filterJobs([securityJob], [], "all", "all", ["Data Engineering"], "all", null, now),
    [],
  );
  assert.deepEqual(
    filterJobs([securityJob], [], "all", "all", ["Security Engineering"], "all", null, now).map(
      (job) => job.id,
    ),
    [40],
  );
});

test("matchesCountry defaults to U.S. based jobs", () => {
  assert.equal(matchesCountry("New York, NY", "us"), true);
  assert.equal(matchesCountry("United States", "us"), true);
  assert.equal(matchesCountry("San Francisco Bay Area", "us"), true);
  assert.equal(matchesCountry("London, UK", "us"), false);
  assert.equal(matchesCountry("London, UK", "all"), true);
});

test("filterJobs defaults to U.S. based jobs", () => {
  assert.deepEqual(
    filterJobs(jobs, [], "all", "all", ["all"], "us", null, now).map((job) => job.id),
    [1, 2],
  );
});

test("matchesCompany filters by exact company name", () => {
  assert.equal(matchesCompany("Stripe", null), true);
  assert.equal(matchesCompany("Stripe", "Stripe"), true);
  assert.equal(matchesCompany("Stripe", "Airbnb"), false);
});

test("filterJobs applies selected company filter", () => {
  const companyJobs = [
    {
      ...jobs[0],
      id: 30,
      company: "Stripe",
    },
    {
      ...jobs[0],
      id: 31,
      company: "Airbnb",
    },
  ];

  assert.deepEqual(
    filterJobs(companyJobs, [], "all", "all", ["all"], "all", "Stripe", now).map(
      (job) => job.id,
    ),
    [30],
  );
});

test("sortJobs sorts dates and keeps missing modification dates last", () => {
  const jobsWithMissingUpdate = [
    jobs[1],
    { ...jobs[0], updatedAt: null },
    jobs[2],
  ];

  assert.deepEqual(
    sortJobs(jobsWithMissingUpdate, "postedAt", "desc").map((job) => job.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    sortJobs(jobsWithMissingUpdate, "updatedAt", "asc").map((job) => job.id),
    [3, 2, 1],
  );
});

test("sortJobs sorts text and experience columns", () => {
  assert.deepEqual(
    sortJobs(jobs, "title", "asc").map((job) => job.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    sortJobs(jobs, "experience", "asc").map((job) => job.id),
    [1, 2, 3],
  );
});
