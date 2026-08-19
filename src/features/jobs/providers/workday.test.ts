import assert from "node:assert/strict";
import test from "node:test";
import { workdayBoards } from "./workday.ts";

test("Workday boards include Arrowstreet Capital public CXS endpoint", () => {
  const board = workdayBoards.find(
    (candidate) => candidate.company === "Arrowstreet Capital",
  );

  assert.equal(board?.token, "arrowstreetcapital/Arrowstreet");
  assert.equal(
    board?.apiUrl,
    "https://arrowstreetcapital.wd5.myworkdayjobs.com/wday/cxs/arrowstreetcapital/Arrowstreet/jobs",
  );
  assert.equal(
    board?.detailUrlBase,
    "https://arrowstreetcapital.wd5.myworkdayjobs.com/wday/cxs/arrowstreetcapital/Arrowstreet",
  );
});
