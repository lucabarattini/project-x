import assert from "node:assert/strict";
import test from "node:test";
import { customCareerBoards, parseCyeraJobs, parseIcolsJobs, parseRenaissanceJobs } from "./custom-careers.ts";

test("custom career boards include SIG, Renaissance, and Cyera", () => {
  assert.deepEqual(customCareerBoards.map((board) => board.company), [
    "Susquehanna International Group",
    "Renaissance Technologies",
    "Cyera",
  ]);
});

test("iCIMS parser keeps the public job id and link", () => {
  const jobs = parseIcolsJobs('<ul><li class="iCIMS_JobCardItem"><a href="https://careers-sig.icims.com/jobs/123/example/job"><h3>Example Engineer</h3></a><dt>Job Category</dt><dd>Technology</dd></li></ul>', customCareerBoards[0]);
  assert.equal(jobs[0]?.id, "123");
  assert.equal(jobs[0]?.title, "Example Engineer");
});

test("Renaissance parser extracts selected positions and locations", () => {
  const jobs = parseRenaissanceJobs('<div class="md:flex mt-4"><a href="/Careers.action?jobs=true&selectedPosition=researchEngineer">Research Engineer</a></div><div>East Setauket, NY</div>', customCareerBoards[1]);
  assert.equal(jobs[0]?.id, "researchEngineer");
  assert.equal(jobs[0]?.location, "East Setauket, NY");
});

test("Cyera parser extracts Comeet links from official career cards", () => {
  const jobs = parseCyeraJobs('<div role="listitem"><div fs-list-field="itemTitle">Data Engineer</div><div fs-list-field="location">US Remote</div><a href="https://www.comeet.com/jobs/cyera/17.008/careers/ABC">View</a></div>', customCareerBoards[2]);
  assert.equal(jobs[0]?.title, "Data Engineer");
  assert.equal(jobs[0]?.location, "US Remote");
});
