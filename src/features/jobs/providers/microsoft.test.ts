import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPcsxLocation, parsePcsxCount, parsePcsxPositions } from "./microsoft";

const siteBaseUrl = "https://apply.careers.microsoft.com/careers";

const response = {
  status: 200,
  data: {
    count: 1107,
    positions: [
      {
        id: 1970393556940748,
        displayJobId: "200044504",
        atsJobId: "200044504",
        name: "Software Engineer",
        locations: ["United States, Multiple Locations, Multiple Locations"],
        standardizedLocations: ["US", "Redmond"],
        department: "Software Engineering",
        workLocationOption: "hybrid",
        postedTs: 1787523905,
        creationTs: 1785232999,
        positionUrl: "/careers/job/1970393556940748",
      },
      {
        id: 1970393556946128,
        name: "Principal Data Scientist",
        creationTs: 1785232999,
      },
    ],
  },
};

test("parsePcsxPositions normalizes the PCSX search payload", () => {
  const jobs = parsePcsxPositions(response, siteBaseUrl);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].id, "200044504");
  assert.equal(jobs[0].title, "Software Engineer");
  assert.equal(jobs[0].location, "United States, Multiple Locations");
  assert.equal(
    jobs[0].absoluteUrl,
    "https://apply.careers.microsoft.com/careers/job/1970393556940748",
  );
  assert.equal(jobs[0].postedAt, new Date(1787523905 * 1000).toISOString());
  assert.equal(jobs[0].contentText, "Software Engineering hybrid");
});

test("parsePcsxPositions falls back to creationTs and a derived job URL", () => {
  const jobs = parsePcsxPositions(response, siteBaseUrl);
  assert.equal(jobs[1].id, "1970393556946128");
  assert.equal(
    jobs[1].absoluteUrl,
    "https://apply.careers.microsoft.com/careers/job/1970393556946128",
  );
  assert.equal(jobs[1].postedAt, new Date(1785232999 * 1000).toISOString());
  assert.equal(jobs[1].location, "Not listed");
});

test("parsePcsxPositions tolerates malformed payloads", () => {
  assert.deepEqual(parsePcsxPositions(null, siteBaseUrl), []);
  assert.deepEqual(parsePcsxPositions({}, siteBaseUrl), []);
  assert.deepEqual(parsePcsxPositions({ data: {} }, siteBaseUrl), []);
  assert.deepEqual(parsePcsxPositions({ data: { positions: [] } }, siteBaseUrl), []);
  assert.deepEqual(
    parsePcsxPositions({ data: { positions: [{ id: 1 }] } }, siteBaseUrl),
    [],
  );
});

test("formatPcsxLocation drops Microsoft's repeated placeholder segments", () => {
  assert.equal(
    formatPcsxLocation(["United States, Multiple Locations, Multiple Locations"]),
    "United States, Multiple Locations",
  );
  assert.equal(formatPcsxLocation(["Redmond, Washington, United States"]), "Redmond, Washington, United States");
  assert.equal(formatPcsxLocation([]), "Not listed");
  assert.equal(formatPcsxLocation(undefined), "Not listed");
});

test("parsePcsxCount reports how many offsets the fan-out should schedule", () => {
  assert.equal(parsePcsxCount(response), 1107);
  assert.equal(parsePcsxCount({ data: { count: 0 } }), 0);
  assert.equal(parsePcsxCount({ data: {} }), 0);
  assert.equal(parsePcsxCount(null), 0);
});
