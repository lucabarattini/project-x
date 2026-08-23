import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMetaJobPage, parseMetaSitemap } from "./meta";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.metacareers.com/profile/job_details/4647361298838627/</loc><lastmod>2026-08-23T15:34:21-07:00</lastmod></url>
  <url><loc>https://www.metacareers.com/profile/job_details/875077395010020/</loc><lastmod>2026-08-23T15:34:21-07:00</lastmod></url>
  <url><loc>https://www.metacareers.com/careerprograms/</loc><lastmod>2026-08-23T15:34:21-07:00</lastmod></url>
</urlset>`;

const jobUrl = "https://www.metacareers.com/profile/job_details/4647361298838627/";

function pageWith(posting: unknown) {
  return `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","name":"nav"}</script>
    <script type="application/ld+json">${JSON.stringify(posting)}</script>
  </head><body></body></html>`;
}

const page = pageWith({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Data Engineer, Analytics (Ranking, AI)",
  datePosted: "2026-07-27T15:14:05-07:00",
  employmentType: "Full-time",
  description: "<p>Ranking AI is the central core machine learning org.</p>",
  responsibilities: "<ul><li>Build pipelines</li></ul>",
  qualifications: "<p>5+ years experience</p>",
  jobLocation: [
    {
      "@type": "Place",
      name: "Sunnyvale, CA",
      address: { addressLocality: "Sunnyvale", addressRegion: "CA", addressCountry: "US" },
    },
    {
      "@type": "Place",
      name: "Bellevue, WA",
      address: { addressLocality: "Bellevue", addressRegion: "WA", addressCountry: "US" },
    },
  ],
});

test("parseMetaSitemap keeps only job detail URLs", () => {
  assert.deepEqual(parseMetaSitemap(sitemap), [
    "https://www.metacareers.com/profile/job_details/4647361298838627/",
    "https://www.metacareers.com/profile/job_details/875077395010020/",
  ]);
  assert.deepEqual(parseMetaSitemap(""), []);
});

test("parseMetaJobPage reads the JobPosting structured data", () => {
  const job = parseMetaJobPage(page, jobUrl);
  assert.ok(job);
  assert.equal(job.id, "4647361298838627");
  assert.equal(job.title, "Data Engineer, Analytics (Ranking, AI)");
  assert.equal(job.location, "Sunnyvale, CA, US · Bellevue, WA, US");
  assert.equal(job.absoluteUrl, jobUrl);
  assert.equal(job.postedAt, new Date("2026-07-27T15:14:05-07:00").toISOString());
  assert.equal(
    job.contentText,
    "Ranking AI is the central core machine learning org. - Build pipelines 5+ years experience",
  );
});

test("parseMetaJobPage skips pages without a JobPosting block", () => {
  assert.equal(parseMetaJobPage("<html></html>", jobUrl), null);
  assert.equal(
    parseMetaJobPage('<script type="application/ld+json">{broken</script>', jobUrl),
    null,
  );
  assert.equal(parseMetaJobPage(pageWith({ "@type": "Organization", name: "Meta" }), jobUrl), null);
  assert.equal(parseMetaJobPage(pageWith({ "@type": "JobPosting" }), jobUrl), null);
});

test("parseMetaJobPage degrades when a posting carries no location", () => {
  const job = parseMetaJobPage(
    pageWith({ "@type": "JobPosting", title: "Remote Engineer", datePosted: "not a date" }),
    jobUrl,
  );
  assert.ok(job);
  assert.equal(job.location, "Not listed");
  assert.equal(job.postedAt, null);
});
