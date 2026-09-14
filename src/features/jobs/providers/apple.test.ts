import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatAppleLocation,
  isAppleRetailStoreTitle,
  parseAppleHydrationData,
  parseAppleTotalRecords,
} from "./apple";

function pageWith(searchResults: unknown, totalRecords = 4497) {
  const document = JSON.stringify({ loaderData: { search: { searchResults, totalRecords } } });
  return `<html><body><script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(document)});</script></body></html>`;
}

const page = pageWith([
  {
    positionId: 200679482,
    reqId: "200679482",
    postingTitle: "Software Development Engineer, Compute Platform",
    transformedPostingTitle: "software-development-engineer-compute-platform",
    locations: [{ name: "Seattle", city: "Seattle", stateProvince: "", countryName: "" }],
    postDateInGMT: "2026-08-23T22:31:22.868472055Z",
    jobSummary: "Build the compute platform.",
    team: { teamName: "Software and Services" },
  },
  {
    positionId: 114438158,
    postingTitle: "Specialist, Emergency Services - Sensing & Connectivity",
    locations: [{ name: "United States", city: "", countryName: "United States of America" }],
    postingDate: "Aug 23, 2026",
  },
]);

test("parseAppleHydrationData reads the server-rendered search results", () => {
  const jobs = parseAppleHydrationData(page);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Software Development Engineer, Compute Platform");
  assert.equal(jobs[0].location, "Seattle, United States");
  assert.equal(
    jobs[0].absoluteUrl,
    "https://jobs.apple.com/en-us/details/200679482/software-development-engineer-compute-platform",
  );
  assert.equal(jobs[0].postedAt, "2026-08-23T22:31:22.868Z");
  assert.match(jobs[0].contentText, /Software and Services\. Build the compute platform\./u);
});

test("parseAppleHydrationData falls back to the human posting date and bare detail URL", () => {
  const jobs = parseAppleHydrationData(page);
  assert.equal(jobs[1].absoluteUrl, "https://jobs.apple.com/en-us/details/114438158");
  assert.equal(jobs[1].postedAt?.slice(0, 10), "2026-08-23");
});

test("parseAppleHydrationData tolerates pages without usable hydration data", () => {
  assert.deepEqual(parseAppleHydrationData(""), []);
  assert.deepEqual(parseAppleHydrationData("<html><body>no script</body></html>"), []);
  assert.deepEqual(
    parseAppleHydrationData(
      '<script>window.__staticRouterHydrationData = JSON.parse("{not json}");</script>',
    ),
    [],
  );
  assert.deepEqual(parseAppleHydrationData(pageWith(null)), []);
  assert.deepEqual(parseAppleHydrationData(pageWith([{ postingTitle: "no id" }])), []);
});

test("formatAppleLocation keeps the country so US filtering still works", () => {
  assert.equal(formatAppleLocation([{ city: "Cupertino" }]), "Cupertino, United States");
  assert.equal(
    formatAppleLocation([{ city: "Austin", stateProvince: "Texas", countryName: "United States" }]),
    "Austin, Texas, United States",
  );
  assert.equal(
    formatAppleLocation([{ name: "United States", countryName: "United States of America" }]),
    "United States",
  );
  assert.equal(formatAppleLocation(undefined), "Not listed");
  assert.equal(formatAppleLocation([]), "Not listed");
});

test("parseAppleTotalRecords reports how many pages the fan-out should schedule", () => {
  assert.equal(parseAppleTotalRecords(page), 4497);
  assert.equal(parseAppleTotalRecords(pageWith([], 0)), 0);
  assert.equal(parseAppleTotalRecords(""), 0);
  assert.equal(
    parseAppleTotalRecords('<script>window.__staticRouterHydrationData = JSON.parse("{broken");</script>'),
    0,
  );
});

test("parseAppleHydrationData drops Apple Store retail postings before they become jobs", () => {
  // Apple republishes the same shop-floor titles per market under a "US-"
  // prefix. They used to be parked in a track no portal lists; now they never
  // enter the snapshot, so they reach neither the board, the JSON feed nor the
  // CSV. Every name here was read off the live board.
  const retailTitles = [
    "US - Specialist: Seasonal, Part-time",
    "US-Specialist (Part Time)",
    "US-Genius",
    "US-Expert",
    "US-Technical Expert",
    "US-Technical Specialist",
    "US-Creative Pro",
    "US-Business Pro",
    "US-Business Expert",
    "US-Operations Expert",
    "US-Operations Specialist",
    "US-Operations Lead",
    "US-Store Leader",
    "US-Manager",
    "US-Senior Manager",
    "US-Lead",
  ];
  for (const title of retailTitles) {
    assert.equal(isAppleRetailStoreTitle(title), true, `expected "${title}" to be a retail posting`);
  }

  const jobs = parseAppleHydrationData(pageWith([
    ...retailTitles.map((postingTitle, index) => ({ positionId: 100 + index, postingTitle })),
    { positionId: 1, postingTitle: "Software Development Engineer, Compute Platform" },
  ]));
  assert.deepEqual(jobs.map((job) => job.title), ["Software Development Engineer, Compute Platform"]);
});

test("the Apple retail rule reads the prefix and the whole title, not one word", () => {
  // "Specialist" is a real Apple engineering title, and the prefix on its own
  // says nothing: the store posting is "US-Lead", while a "US - Lead Software
  // Engineer" would be an engineering role. A false drop hides a real job,
  // which is the worse failure of the two.
  for (const title of [
    "Specialist, Emergency Services - Sensing & Connectivity",
    "US - Lead Software Engineer",
    "US - Senior Software Engineer",
    "US-Data Scientist",
  ]) {
    assert.equal(isAppleRetailStoreTitle(title), false, `expected "${title}" to survive`);
  }
});
