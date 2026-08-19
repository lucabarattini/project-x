import assert from "node:assert/strict";
import { test } from "node:test";
import type { GreenhouseJob } from "./providers/greenhouse";
import { buildSearchEntry } from "./search-model";
import {
  decodeCursor,
  defaultSearchParams,
  parseSearchParams,
  searchJobs,
  serializeSearchParams,
} from "./search";

function job(overrides: Partial<GreenhouseJob> = {}): GreenhouseJob {
  return {
    id: "job-1",
    title: "Software Engineer",
    company: "Acme",
    boardToken: "acme",
    location: "New York, NY, United States",
    absoluteUrl: "https://boards.example.com/job-1",
    contentText: "Required Qualifications: 3+ years of experience building web applications.",
    postedAt: "2026-08-14T12:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

function entries(jobs: GreenhouseJob[]) {
  return jobs.map(buildSearchEntry);
}

test("parseSearchParams returns defaults for an empty query", () => {
  const params = parseSearchParams({});
  assert.deepEqual(params, defaultSearchParams);
});

test("parseSearchParams reads comma lists and short track ids", () => {
  const params = parseSearchParams({
    q: "machine learning",
    loc: "New York,Seattle",
    exp: "early,mid",
    tracks: "ai,ml,review",
    company: "Acme",
    date: "week",
    sort: "title",
    dir: "asc",
  });
  assert.equal(params.q, "machine learning");
  assert.deepEqual(params.locations, ["New York", "Seattle"]);
  assert.deepEqual(params.experience, ["early", "mid"]);
  assert.deepEqual(params.roleTypes, ["AI & Applied Science", "Machine Learning Engineering", "Needs Review"]);
  assert.equal(params.company, "Acme");
  assert.equal(params.date, "week");
  assert.equal(params.sort, "title");
  assert.equal(params.dir, "asc");
});

test("parseSearchParams ignores unknown values", () => {
  const params = parseSearchParams({ date: "nonsense", country: "eu", limit: "999", tracks: "bogus" });
  assert.equal(params.date, "today");
  assert.equal(params.country, "us");
  assert.equal(params.limit, 50);
  assert.deepEqual(params.roleTypes, defaultSearchParams.roleTypes);
});

test("serializeSearchParams omits defaults and keeps changes", () => {
  assert.equal(serializeSearchParams({ ...defaultSearchParams }), "");
  const query = serializeSearchParams({ ...defaultSearchParams, company: "Acme", q: "ai" });
  assert.match(query, /company=Acme/);
  assert.match(query, /q=ai/);
  assert.doesNotMatch(query, /country=/);
});

test("serializeSearchParams round-trips through parseSearchParams", () => {
  const custom = {
    ...defaultSearchParams,
    locations: ["New York"],
    experience: ["senior"],
    roleTypes: ["Quant & Trading Technology"],
    sort: "experience" as const,
  };
  const query = serializeSearchParams(custom);
  const parsed = parseSearchParams(Object.fromEntries(new URLSearchParams(query.replace(/^\?/, ""))));
  assert.deepEqual(parsed, custom);
});

test("keyword search matches title, company and location", () => {
  const data = entries([
    job({ id: "1", title: "Machine Learning Engineer", company: "Alpha" }),
    job({ id: "2", title: "Data Scientist", company: "Beta", location: "Seattle, WA" }),
    job({ id: "3", title: "Platform Engineer", company: "Gamma" }),
  ]);
  const result = searchJobs(data, { ...defaultSearchParams, q: "machine", date: "all" });
  assert.equal(result.total, 1);
  assert.equal(result.jobs[0].title, "Machine Learning Engineer");

  const byCompany = searchJobs(data, { ...defaultSearchParams, q: "beta", date: "all" });
  assert.equal(byCompany.total, 1);
  assert.equal(byCompany.jobs[0].company, "Beta");

  const byLocation = searchJobs(data, { ...defaultSearchParams, q: "seattle", date: "all" });
  assert.equal(byLocation.total, 1);
});

test("results are slim: never leak contentText to the client", () => {
  const data = entries([job()]);
  const result = searchJobs(data, { ...defaultSearchParams, date: "all", roleTypes: ["all"] });
  assert.equal(result.jobs.length, 1);
  assert.equal("contentText" in result.jobs[0], false);
  assert.ok(result.jobs[0].absoluteUrl);
  assert.ok(result.jobs[0].badgeLabel);
});

test("pagination returns one page with an opaque cursor", () => {
  const data = entries(
    Array.from({ length: 7 }, (_, index) =>
      job({ id: String(index), title: `Software Engineer ${index}` }),
    ),
  );
  const params = { ...defaultSearchParams, limit: 3, date: "all", roleTypes: ["all"] };
  const first = searchJobs(data, params, 0);
  assert.equal(first.jobs.length, 3);
  assert.equal(first.total, 7);
  assert.ok(first.nextCursor);

  const second = searchJobs(data, params, decodeCursor(first.nextCursor));
  assert.equal(second.jobs.length, 3);
  assert.notEqual(second.jobs[0].id, first.jobs[0].id);

  const third = searchJobs(data, params, decodeCursor(second.nextCursor));
  assert.equal(third.jobs.length, 1);
  assert.equal(third.nextCursor, null);
});

test("company filter composes with role type and experience filters", () => {
  const data = entries([
    job({ id: "1", title: "Machine Learning Engineer", company: "Alpha" }),
    job({ id: "2", title: "Data Scientist", company: "Alpha" }),
    job({ id: "3", title: "Account Executive", company: "Alpha" }),
  ]);
  const params = {
    ...defaultSearchParams,
    company: "Alpha",
    roleTypes: ["Machine Learning Engineering"],
    experience: ["early", "not_stated", "conflicting"],
    date: "all",
  };
  const result = searchJobs(data, params);
  assert.equal(result.total, 1);
  assert.equal(result.jobs[0].title, "Machine Learning Engineer");
});

test("experience sort ranks senior roles last", () => {
  const data = entries([
    job({ id: "1", title: "Senior Machine Learning Engineer", contentText: "" }),
    job({ id: "2", title: "Machine Learning Engineer", contentText: "Required Qualifications: 2+ years of experience." }),
    job({ id: "3", title: "Staff Machine Learning Engineer", contentText: "" }),
  ]);
  const params = {
    ...defaultSearchParams,
    sort: "experience",
    dir: "asc" as const,
    date: "all",
    roleTypes: ["all"],
    experience: ["all"],
  };
  const result = searchJobs(data, params);
  assert.equal(result.jobs.length, 3);
  assert.match(result.jobs[0].title, /^Machine Learning Engineer$/);
});

test("software-engineering variants are hidden with default filters", () => {
  const data = entries([
    job({ id: "1", title: "Software Engineer", company: "Alpha" }),
    job({ id: "2", title: "Software Development Engineer", company: "Alpha" }),
    job({ id: "3", title: "Software Developer Engineer", company: "Alpha" }),
    job({ id: "4", title: "Staff Software Engineer", company: "Alpha" }),
    job({ id: "5", title: "Staff Software Developer Engineer", company: "Alpha" }),
    job({ id: "6", title: "SWE", company: "Alpha" }),
  ]);
  const defaults = searchJobs(data, { ...defaultSearchParams, date: "all" });
  assert.equal(defaults.total, 0, "no software-engineering role should appear by default");

  const withSwe = searchJobs(data, {
    ...defaultSearchParams,
    date: "all",
    roleTypes: ["Software Engineering"],
    experience: ["all"],
  });
  assert.equal(withSwe.total, 6, "all variants surface when the track is enabled explicitly");
});

test("operational and business noise is hidden with default filters", () => {
  const data = entries([
    job({ id: "1", title: "Data Center Technician", company: "Alpha" }),
    job({ id: "2", title: "Account Executive", company: "Alpha" }),
    job({ id: "3", title: "Software Dev Engineer", company: "Alpha" }),
    job({ id: "4", title: "Machine Learning Engineer", company: "Alpha" }),
  ]);
  const defaults = searchJobs(data, { ...defaultSearchParams, date: "all" });
  assert.equal(defaults.total, 1, "only the ML role should appear by default");
  assert.equal(defaults.jobs[0].title, "Machine Learning Engineer");

  const withOps = searchJobs(data, {
    ...defaultSearchParams,
    date: "all",
    roleTypes: ["all"],
    experience: ["all"],
  });
  assert.equal(withOps.total, 4, "every role surfaces when all tracks are enabled");
});

test("data analysts surface on both the tech and non-tech portals", () => {
  const data = entries([
    job({ id: "1", title: "Data Analyst", company: "Alpha", location: "New York, NY, United States" }),
  ]);
  const tech = searchJobs(data, { ...defaultSearchParams, date: "all" });
  assert.equal(tech.total, 1, "data analyst appears on the tech portal");

  const nonTech = searchJobs(data, { ...defaultSearchParams, date: "all", portal: "non-tech" });
  assert.equal(nonTech.total, 1, "data analyst appears on the non-tech portal");
  assert.equal(nonTech.jobs[0].nonTechFamily, "Analytics & Strategy");
});

test("selecting a European city overrides the U.S.-only country default", () => {
  const data = entries([
    job({ id: "1", title: "Machine Learning Engineer", location: "London, United Kingdom" }),
    job({ id: "2", title: "Data Scientist", location: "New York, NY, United States" }),
  ]);
  const params = { ...defaultSearchParams, locations: ["London"], date: "all" };
  const result = searchJobs(data, params);
  assert.equal(result.total, 1);
  assert.equal(result.jobs[0].location, "London, United Kingdom");
});
