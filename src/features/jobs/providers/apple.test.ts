import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAppleLocation, parseAppleHydrationData } from "./apple";

function pageWith(searchResults: unknown) {
  const document = JSON.stringify({ loaderData: { search: { searchResults } } });
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
    postingTitle: "US - Specialist: Seasonal, Part-time",
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
