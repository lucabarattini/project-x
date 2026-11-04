import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeInstructions, labelSide, summarizeCorrections } from "./judge";

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

test("the report counts only corrections that overruled the judge", () => {
  const { overruled, wrongPage } = summarizeCorrections(
    { a: "Sales & Partnerships", b: "Software Engineering", c: "Software Engineering" },
    {
      a: { title: "Solutions Engineer", company: "Acme", label: "Forward Deployed" },
      b: { title: "Platform Engineer", company: "Acme", label: "Platform & Infrastructure" },
      c: { title: "Backend Engineer", company: "Acme", label: "Software Engineering" },
      d: { title: "Old Role", company: "Acme", label: "Finance & Accounting" },
    },
  );
  assert.deepEqual(overruled.map(({ key }) => key), ["a", "b"]);
  assert.equal(wrongPage, 1);
  assert.equal(labelSide("Manual & Field Operations"), "neither");
});
