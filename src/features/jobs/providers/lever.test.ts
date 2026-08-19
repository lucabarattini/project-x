import assert from "node:assert/strict";
import test from "node:test";
import { leverBoards } from "./lever.ts";

test("Lever boards include TGS Management public postings endpoint", () => {
  const board = leverBoards.find((candidate) => candidate.company === "TGS Management");

  assert.equal(board?.token, "tgsmc");
  assert.equal(board?.apiUrl, "https://api.lever.co/v0/postings/tgsmc?mode=json");
});
