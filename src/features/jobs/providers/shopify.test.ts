import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTurboStream, parseShopifyCareers, parseShopifyPosting } from "./shopify";

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

// Since late October 2026 the list carries only a summary per posting; the date moved to the posting's page.
const summaries = page([
  { _1: 2 },
  "roles",
  [3],
  { _4: 5, _6: 7, _8: 9, _10: 11, _12: 13 },
  "id", "40ef1cb0",
  "title", "Senior Financial Analyst - Multiple Roles",
  "location", "Remote - Americas",
  "discipline", "Finance",
  "href", "/careers/senior-financial-analyst-multiple-roles_40ef1cb0",
]);

test("parseShopifyCareers reads the summary-only list and links each posting's page", () => {
  const jobs = parseShopifyCareers(summaries);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "shopify-40ef1cb0");
  assert.equal(jobs[0].location, "Remote - Americas");
  assert.equal(jobs[0].team, "Finance");
  assert.equal(jobs[0].postedAt, null);
  assert.equal(jobs[0].url, "https://www.shopify.com/careers/senior-financial-analyst-multiple-roles_40ef1cb0");
});

test("parseShopifyPosting reads the date and description from the posting's page", () => {
  const html = page([
    { _1: 2 }, "jobPosting", { _3: 4, _5: 6, _7: 8 },
    "descriptionPlain", "Multiple Financial Analysts and Senior Financial Analysts.",
    "publishedDate", "2025-10-22",
    "employmentType", "FullTime",
  ]);
  assert.deepEqual(parseShopifyPosting(html), {
    description: "Multiple Financial Analysts and Senior Financial Analysts.",
    postedAt: "2025-10-22",
    team: null,
    employmentType: "FullTime",
  });
});

test("parseShopifyDescription reads the posting's own page", () => {
  const html = page([{ _1: 2 }, "posting", { _3: 4 }, "descriptionHtml", "<p>You have 1-3 years of experience.</p>"]);
  assert.equal(parseShopifyPosting(html).description, "You have 1-3 years of experience.");
});

test("a page without loader data yields nothing", () => {
  assert.deepEqual(parseShopifyCareers("<html></html>"), []);
});
