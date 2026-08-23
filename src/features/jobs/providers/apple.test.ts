import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAppleSearchResults } from "./apple";

const response = {
  totalRecords: 2,
  searchResults: [
    {
      positionId: 200567890,
      postingTitle: "Financial Analyst",
      location: "Seattle, Washington, United States",
      postingDate: 1787000000000,
      transformedPostingUrl: "https://jobs.apple.com/en-us/details/200567890",
      jobDescription: "<p>Analyze financial data.</p>",
    },
    {
      positionId: 200567891,
      postingTitle: "Software Engineer",
      postingDate: "2026-08-20T10:00:00.000Z",
    },
  ],
};

test("parseAppleSearchResults normalizes roles with date fallbacks", () => {
  const jobs = parseAppleSearchResults(response);
  assert.equal(jobs.length, 2);

  assert.equal(jobs[0].title, "Financial Analyst");
  assert.equal(jobs[0].location, "Seattle, Washington, United States");
  assert.equal(jobs[0].absoluteUrl, "https://jobs.apple.com/en-us/details/200567890");
  assert.equal(jobs[0].postedAt, new Date(1787000000000).toISOString());
  assert.ok(jobs[0].contentText.includes("Analyze financial data"));

  assert.equal(jobs[1].absoluteUrl, "https://jobs.apple.com/en-us/details/200567891");
  assert.equal(jobs[1].location, "Not listed");
  assert.equal(jobs[1].postedAt, "2026-08-20T10:00:00.000Z");
});

test("parseAppleSearchResults tolerates malformed payloads", () => {
  assert.deepEqual(parseAppleSearchResults(null), []);
  assert.deepEqual(parseAppleSearchResults({}), []);
  assert.deepEqual(parseAppleSearchResults({ searchResults: [] }), []);
  assert.deepEqual(parseAppleSearchResults({ searchResults: [{ postingTitle: "No id" }] }), []);
});
