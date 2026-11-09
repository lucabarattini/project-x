import assert from "node:assert/strict";
import { test } from "node:test";
import { alertEmail, alertKey, digestDue, isAlertRole } from "./alerts";
import type { IndexRow } from "./search-model";

const row = (company: string, location: string, title = "Financial Analyst"): IndexRow => [
  "1", title, company, "board", location, "https://example.com/1", "2026-11-09T00:00:00.000Z", null,
  "Non-Technical", "Finance & Accounting", "not-stated", null, null,
];

test("alerts cover the three companies, remote in the U.S. or in Washington", () => {
  assert.equal(isAlertRole(row("Nordstrom", "Seattle, WA")), true);
  assert.equal(isAlertRole(row("Starbucks", "Kent, WA, US")), true);
  assert.equal(isAlertRole(row("Shopify", "Remote - Americas")), true);
  assert.equal(isAlertRole(row("Shopify", "Remote - Germany")), false);
  assert.equal(isAlertRole(row("Nordstrom", "New York, NY")), false);
  assert.equal(isAlertRole(row("Stripe", "Seattle, WA")), false);
});

test("the email lists every role with its link, and the key ignores the posting id", () => {
  const email = alertEmail([row("Shopify", "Remote - Americas"), row("Nordstrom", "Seattle, WA", "Buyer")]);
  assert.equal(email.subject, "Daily job digest from Luca");
  assert.match(email.text, /^2 new roles worth a look at Nordstrom, Shopify and Starbucks/);
  assert.match(alertEmail([row("Shopify", "Remote - Americas")], 3).text, /3 other new roles were left out as not a fit\.$/);
  assert.match(email.html, /href="https:\/\/example.com\/1"/);
  assert.equal(alertKey(row("Shopify", "Remote - Americas")), "Shopify|financial analyst|Remote - Americas");
});

test("the digest goes out once a day, after the morning hour", () => {
  assert.equal(digestDue(null, new Date("2026-11-10T11:30:00Z")), false);
  assert.equal(digestDue(null, new Date("2026-11-10T13:10:00Z")), true);
  assert.equal(digestDue("2026-11-10", new Date("2026-11-10T19:00:00Z")), false);
  assert.equal(digestDue("2026-11-09", new Date("2026-11-10T13:10:00Z")), true);
});
