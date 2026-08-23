import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExpediaJobPage, parseExpediaSitemap } from "./expedia";

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://careers.expediagroup.com/job/sr-business-program-specialist/seattle-wa/R-108771/</loc>
    <lastmod>2026-08-22T01:12:06+00:00</lastmod>
  </url>
  <url>
    <loc>https://careers.expediagroup.com/job/senior-product-designer/mountain-view-ca/R-109042/</loc>
    <lastmod>2026-08-21T09:00:00+00:00</lastmod>
  </url>
  <url>
    <loc>https://careers.expediagroup.com/blog/not-a-job</loc>
  </url>
</urlset>`;

test("parseExpediaSitemap extracts job urls with lastmod dates", () => {
  const entries = parseExpediaSitemap(sitemapXml);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].url, "https://careers.expediagroup.com/job/sr-business-program-specialist/seattle-wa/R-108771/");
  assert.equal(entries[0].lastmod, "2026-08-22T01:12:06+00:00");
  assert.equal(entries[2].lastmod, null);
});

const jobPageHtml = `<!doctype html>
<html><head>
<meta property="og:title" content="Sr Business Program Specialist in Seattle, Washington" />
</head><body>
<h1>Sr Business Program Specialist</h1>
<div class="Desc__copy text-body">
<p>At Expedia Group, we help travelers explore the world.</p><br />
<p>Here, you&#39;ll do meaningful work.</p>
</div>
</body></html>`;

test("parseExpediaJobPage extracts title, location and description", () => {
  const job = parseExpediaJobPage(
    jobPageHtml,
    "https://careers.expediagroup.com/job/sr-business-program-specialist/seattle-wa/R-108771/",
    "2026-08-22T01:12:06+00:00",
  );
  assert.equal(job.id, "expedia-108771");
  assert.equal(job.title, "Sr Business Program Specialist");
  assert.equal(job.location, "Seattle, Washington");
  assert.ok(job.contentText.includes("we help travelers explore the world"));
  assert.equal(job.postedAt, "2026-08-22T01:12:06.000Z");
});

test("parseExpediaJobPage tolerates pages without a description block", () => {
  const job = parseExpediaJobPage(
    `<html><head><meta property="og:title" content="Some Role in London, England" /></head><body><h1>Some Role</h1></body></html>`,
    "https://careers.expediagroup.com/job/some-role/london-england/R-1/",
    null,
  );
  assert.equal(job.title, "Some Role");
  assert.equal(job.location, "London, England");
  assert.equal(job.postedAt, null);
});
