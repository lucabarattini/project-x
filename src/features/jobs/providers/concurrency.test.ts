import assert from "node:assert/strict";
import { test } from "node:test";
import { BoardFailure, readBoards } from "./concurrency.ts";

test("readBoards reads timed-out boards again, with more time, and leaves other failures", async () => {
  const calls: string[] = [];
  const results = await readBoards(
    [{ company: "Big" }, { company: "Small" }, { company: "Gone" }],
    4,
    100,
    async (board, timeoutMs) => {
      calls.push(`${board.company}:${timeoutMs}`);
      if (board.company === "Gone") throw new Error("Gone returned 404");
      if (board.company === "Big" && timeoutMs === 100) throw Object.assign(new Error("slow"), { name: "TimeoutError" });
      return [board.company];
    },
  );
  assert.deepEqual(results.slice(0, 2), [["Big"], ["Small"]]);
  assert.ok(results[2] instanceof BoardFailure && results[2].reason === "404");
  assert.deepEqual(calls.filter((call) => call.startsWith("Big")), ["Big:100", "Big:200"]);
  assert.equal(calls.filter((call) => call.startsWith("Gone")).length, 1);
});
