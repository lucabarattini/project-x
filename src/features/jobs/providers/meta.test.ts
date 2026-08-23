import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMetaJobSearch } from "./meta";

const response = {
  data: {
    job_search: [
      {
        id: "1010234865172301",
        title: "Software Engineer",
        locations: ["Seattle, WA", "Menlo Park, CA"],
        teams: ["Engineering"],
      },
      {
        id: "1010234865172302",
        title: "Recruiter",
        locations: ["New York, NY"],
        teams: ["People"],
      },
    ],
  },
};

test("parseMetaJobSearch normalizes the GraphQL job_search payload", () => {
  const jobs = parseMetaJobSearch(response);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Software Engineer");
  assert.equal(jobs[0].location, "Seattle, WA · Menlo Park, CA");
  assert.equal(jobs[0].absoluteUrl, "https://www.metacareers.com/jobs/1010234865172301");
  assert.equal(jobs[0].contentText, "Engineering");
});

test("parseMetaJobSearch tolerates malformed payloads", () => {
  assert.deepEqual(parseMetaJobSearch(null), []);
  assert.deepEqual(parseMetaJobSearch({}), []);
  assert.deepEqual(parseMetaJobSearch({ data: {} }), []);
  assert.deepEqual(parseMetaJobSearch({ data: { job_search: [] } }), []);
  assert.deepEqual(
    parseMetaJobSearch({ data: { job_search: [{ title: "no id" }] } }),
    [],
  );
});
