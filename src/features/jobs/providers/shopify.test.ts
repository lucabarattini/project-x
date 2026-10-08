import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTurboStream, parseShopifyCareers, parseShopifyDescription } from "./shopify";

// The careers page ships its React Router loader data as a turbo-stream inside
// streamController.enqueue("…"): a flat array of values referenced by index.
const page = (values: unknown[]) =>
  `<html><script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(`${JSON.stringify(values)}\n`)});</script></html>`;

const careers = page([
  { _1: 2 },
  "jobs",
  [3, 16],
  { _4: 5, _6: 7, _8: 9, _10: 11, _12: 13, _14: 15 },
  "title", "Senior Treasury Analyst",
  "externalLink", "https://www.shopify.com/careers?ashby_jid=abc",
  "locationName", "Americas",
  "workplaceType", "Remote",
  "publishedDate", "2026-10-01",
  "teamName", "Finance",
  { _4: 17, _6: 18, _8: 19, _10: 11, _20: 21 },
  "Account Executive", "https://www.shopify.com/careers?ashby_jid=def", "Ireland",
  "isListed", false,
]);

test("decodeTurboStream rebuilds objects and arrays from indexes", () => {
  const root = decodeTurboStream(careers) as { jobs: Array<{ title: string }> };
  assert.equal(root.jobs.length, 2);
  assert.equal(root.jobs[0].title, "Senior Treasury Analyst");
});

test("parseShopifyCareers keeps listed postings and marks them remote by region", () => {
  const jobs = parseShopifyCareers(careers);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Senior Treasury Analyst");
  assert.equal(jobs[0].location, "Remote - Americas");
  assert.equal(jobs[0].team, "Finance");
  assert.equal(jobs[0].postedAt, "2026-10-01");
  assert.equal(jobs[0].url, "https://www.shopify.com/careers?ashby_jid=abc");
});

test("parseShopifyDescription reads the posting's own page", () => {
  const html = page([{ _1: 2 }, "posting", { _3: 4 }, "descriptionHtml", "<p>You have 1-3 years of experience.</p>"]);
  assert.equal(parseShopifyDescription(html), "You have 1-3 years of experience.");
});

test("a page without loader data yields nothing", () => {
  assert.deepEqual(parseShopifyCareers("<html></html>"), []);
});
