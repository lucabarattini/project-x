import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchEntry, fromIndexRow, toIndexRow } from "./search-model";

const row = toIndexRow(buildSearchEntry({
  id: "1",
  title: "Capacity Delivery Lead",
  company: "Acme",
  boardToken: "acme",
  location: "Seattle, WA",
  absoluteUrl: "https://example.com/1",
  contentText: "",
  postedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: null,
}));

test("an unjudged row keeps what the title rules decided", () => {
  assert.equal(fromIndexRow(row).category, "Needs Review");
});

test("a technical label replaces the rules and leaves the non-tech portal", () => {
  const entry = fromIndexRow(row, "Platform & Infrastructure");
  assert.equal(entry.category, "Platform & Infrastructure");
  assert.equal(entry.nonTechFamily, null);
});

test("a non-technical label sets the family", () => {
  const entry = fromIndexRow(row, "Finance & Accounting");
  assert.equal(entry.category, "Non-Technical");
  assert.equal(entry.nonTechFamily, "Finance & Accounting");
});

test("a refusal, stored as an empty label, keeps the rules", () => {
  assert.equal(fromIndexRow(row, "").category, "Needs Review");
});
