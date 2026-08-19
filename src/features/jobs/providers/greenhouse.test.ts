import assert from "node:assert/strict";
import test from "node:test";
import { resolveGreenhouseJobUrl } from "./greenhouse.ts";

test("resolveGreenhouseJobUrl uses a verified canonical Stripe detail page", () => {
  assert.equal(
    resolveGreenhouseJobUrl(
      "stripe",
      8075570,
      "https://stripe.com/jobs/search?gh_jid=8075570",
    ),
    "https://stripe.com/careers/listing/forward-deployed-engineer-professional-services/8075570",
  );
});

test("resolveGreenhouseJobUrl preserves provider URLs without a verified override", () => {
  assert.equal(
    resolveGreenhouseJobUrl(
      "stripe",
      7217048,
      "https://stripe.com/jobs/search?gh_jid=7217048",
    ),
    "https://stripe.com/jobs/search?gh_jid=7217048",
  );
  assert.equal(
    resolveGreenhouseJobUrl(
      "anthropic",
      123,
      "https://job-boards.greenhouse.io/anthropic/jobs/123",
    ),
    "https://job-boards.greenhouse.io/anthropic/jobs/123",
  );
});
