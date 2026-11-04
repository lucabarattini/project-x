import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeInstructions } from "./judge";

test("corrections join the prompt as examples, newest twenty only", () => {
  assert.doesNotMatch(judgeInstructions({}), /corrected/);
  const corrections = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
    `acme:${index}`,
    { title: `Role ${index}`, company: "Acme", label: "Forward Deployed" },
  ]));
  const prompt = judgeInstructions(corrections);
  assert.match(prompt, /"Role 24" at Acme: Forward Deployed/);
  assert.doesNotMatch(prompt, /"Role 4" at Acme/);
  assert.match(prompt, /"Role 5" at Acme/);
});
