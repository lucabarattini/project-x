import assert from "node:assert/strict";
import test from "node:test";
import { extractJobMetadataFromHtml, isSupportedJobUrl } from "./enrichment";

test("extracts title and structured locations from JobPosting JSON-LD", () => {
  const html = `
    <html><head><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Strategy and Operations Lead",
        "jobLocation": [
          {"address": {"addressLocality": "New York", "addressRegion": "NY", "addressCountry": "United States"}},
          {"address": {"addressLocality": "Chicago", "addressRegion": "IL", "addressCountry": "United States"}}
        ]
      }
    </script></head></html>
  `;
  assert.deepEqual(extractJobMetadataFromHtml(html), {
    title: "Strategy and Operations Lead",
    locations: ["New York, NY, United States", "Chicago, IL, United States"],
  });
});

test("only permits configured company career URLs for enrichment", () => {
  assert.equal(isSupportedJobUrl("https://www.amazon.jobs/en/jobs/123/title"), true);
  assert.equal(isSupportedJobUrl("https://www.google.com/about/careers/applications/jobs/results/123-title"), true);
  assert.equal(isSupportedJobUrl("https://jobs.ashbyhq.com/abridge/abc123"), true);
  assert.equal(isSupportedJobUrl("https://lnkd.in/example"), false);
  assert.equal(isSupportedJobUrl("http://127.0.0.1/admin"), false);
});
