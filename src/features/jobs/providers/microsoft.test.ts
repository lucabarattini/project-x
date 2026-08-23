import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEightfoldJobs } from "./microsoft";

const response = {
  count: 2,
  positions: [
    {
      id: "123456",
      name: "Software Engineer II",
      location: "Redmond, WA",
      locations: ["Redmond, WA", "Seattle, WA"],
      department: "Engineering",
      business_unit: "Azure",
      t_create: 1787000000,
      canonicalPositionUrl: "https://microsoft.eightfold.ai/careers/job/123456",
    },
    {
      id: "789012",
      posting_name: "Finance Manager",
      locations: ["New York, NY"],
      t_update: 1787000000,
    },
    { name: "", canonicalPositionUrl: "https://microsoft.eightfold.ai/careers/job/bad" },
  ],
};

test("parseEightfoldJobs normalizes positions with fallbacks", () => {
  const jobs = parseEightfoldJobs(response, "https://microsoft.eightfold.ai/careers");
  assert.equal(jobs.length, 2);

  assert.equal(jobs[0].title, "Software Engineer II");
  assert.equal(jobs[0].location, "Redmond, WA · Seattle, WA");
  assert.equal(jobs[0].absoluteUrl, "https://microsoft.eightfold.ai/careers/job/123456");
  assert.equal(jobs[0].postedAt, new Date(1787000000 * 1000).toISOString());
  assert.ok(jobs[0].contentText.includes("Azure"));

  assert.equal(jobs[1].title, "Finance Manager");
  assert.equal(jobs[1].location, "New York, NY");
  assert.equal(jobs[1].absoluteUrl, "https://microsoft.eightfold.ai/careers?pid=789012");
});

test("parseEightfoldJobs tolerates malformed payloads", () => {
  assert.deepEqual(parseEightfoldJobs(null, "https://x"), []);
  assert.deepEqual(parseEightfoldJobs({ positions: null }, "https://x"), []);
  assert.deepEqual(parseEightfoldJobs({ positions: [] }, "https://x"), []);
  assert.deepEqual(parseEightfoldJobs({}, "https://x"), []);
});
