import test from "node:test";
import assert from "node:assert/strict";
import { ashbyBoards, stripAshbyHtml } from "./ashby.ts";

test("stripAshbyHtml converts Ashby HTML descriptions into plain text", () => {
  assert.equal(
    stripAshbyHtml("<h3>About</h3><p>Build useful tools&nbsp;&amp; systems.</p><ul><li>Own launches</li></ul>"),
    "About Build useful tools & systems. - Own launches",
  );
});

test("user-supplied companies use their verified public Ashby boards", () => {
  const expectedBoards = [
    ["Fal", "fal-ai", 31],
    ["Fireworks AI", "fireworks", 54],
    ["Gamma", "gamma", 33],
    ["Listen Labs", "listenlabs", 28],
    ["Mercor", "mercor", 78],
    ["Midjourney", "midjourney", 20],
    ["Wispr Flow", "wispr-flow", 25],
  ] as const;

  for (const [company, token, jobCount] of expectedBoards) {
    const board = ashbyBoards.find((candidate) => candidate.company === company);

    assert.equal(board?.token, token);
    assert.equal(
      board?.apiUrl,
      `https://api.ashbyhq.com/posting-api/job-board/${token}`,
    );
    assert.equal(board?.lastVerifiedJobCount, jobCount);
  }
});
