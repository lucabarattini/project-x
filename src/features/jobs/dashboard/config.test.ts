import assert from "node:assert/strict";
import test from "node:test";
import { defaultRoleTracks, roleTracks } from "./config.ts";

test("Needs Review is available and selected by default", () => {
  assert.equal(roleTracks.includes("Needs Review"), true);
  assert.equal(defaultRoleTracks.includes("Needs Review"), true);
});
