import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGoogleDatePostedHtml,
  parseGoogleJobsHtml,
  parseGoogleJobsPayloadHtml,
} from "./google.ts";

test("parseGoogleJobsHtml extracts Google Careers cards", () => {
  const html = `
    <h3 class="QJPWVe">Strategy Associate, YouTube</h3>
    <p class="l103df">YouTube | <span class="pwO9Dc">
      <span class="r0wTof ">San Bruno, CA, USA</span>
      <span class="r0wTof p3oCrc">; New York, NY, USA</span>
    </span></p>
    <div class="Xsxa1e"><h4>Minimum qualifications</h4><ul>
      <li>3 years of experience in management consulting.</li>
    </ul></div>
    <a class="WpHeLc" href="jobs/results/121081200138691270-strategy-associate-youtube?location=United+States" aria-label="Learn more about Strategy Associate, YouTube"></a>
  `;

  const jobs = parseGoogleJobsHtml(html);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "121081200138691270-strategy-associate-youtube");
  assert.equal(jobs[0].title, "Strategy Associate, YouTube");
  assert.equal(jobs[0].location, "San Bruno, CA, USA; New York, NY, USA");
  assert.equal(
    jobs[0].absoluteUrl,
    "https://www.google.com/about/careers/applications/jobs/results/121081200138691270-strategy-associate-youtube?location=United+States",
  );
  assert.match(jobs[0].contentText, /Minimum qualifications/u);
  assert.equal(jobs[0].postedAt, null);
});

test("parseGoogleJobsHtml maps Google's raw publish and update timestamps", () => {
  const row = Array.from<unknown>({ length: 14 }).fill(null);
  row[0] = "82087125486314182";
  row[1] = "Manufacturing Structural Test Development Engineer";
  row[4] = [
    null,
    "<h3>Minimum qualifications:</h3><ul><li>8 years of experience.</li></ul>",
  ];
  row[12] = [1783948218, 86_000_000];
  row[13] = [1786019897, 91_000_000];
  const payload = [[row], null, 1, 20];
  const html = `
    <h3 class="QJPWVe">Manufacturing Structural Test Development Engineer</h3>
    <span class="pwO9Dc"><span class="r0wTof">Sunnyvale, CA, USA</span></span>
    <a href="jobs/results/82087125486314182-manufacturing-structural-test-development-engineer?location=United+States"
       aria-label="Learn more about Manufacturing Structural Test Development Engineer"></a>
    <script class="ds:1">AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(payload)}, sideChannel: {}});</script>
  `;

  const rawJobs = parseGoogleJobsPayloadHtml(html);
  const jobs = parseGoogleJobsHtml(html);

  assert.equal(rawJobs.size, 1);
  assert.equal(rawJobs.get("82087125486314182")?.postedAt, "2026-07-13T13:10:18.086Z");
  assert.equal(rawJobs.get("82087125486314182")?.updatedAt, "2026-08-06T12:38:17.091Z");
  assert.equal(jobs[0].postedAt, "2026-07-13T13:10:18.086Z");
  assert.equal(jobs[0].updatedAt, "2026-08-06T12:38:17.091Z");
  assert.match(jobs[0].contentText, /8 years of experience/u);
});

test("parseGoogleJobsPayloadHtml fails closed when Google changes the payload", () => {
  assert.equal(
    parseGoogleJobsPayloadHtml(
      `<script class="ds:1">AF_initDataCallback({data:not-json, sideChannel: {}});</script>`,
    ).size,
    0,
  );
});

test("parseGoogleDatePostedHtml reads JSON-LD datePosted when present", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Strategy Associate",
        "datePosted": "2026-06-15"
      }
    </script>
  `;

  assert.equal(parseGoogleDatePostedHtml(html), "2026-06-15");
});
