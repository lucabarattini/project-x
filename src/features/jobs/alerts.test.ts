import assert from "node:assert/strict";
import { test } from "node:test";
import { alertEmail, alertKey, isAlertRole } from "./alerts";
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
  assert.equal(email.subject, "2 new roles at Nordstrom, Shopify");
  assert.match(email.html, /href="https:\/\/example.com\/1"/);
  assert.equal(alertKey(row("Shopify", "Remote - Americas")), "Shopify|financial analyst|Remote - Americas");
});
