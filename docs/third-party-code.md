# Third-party code and reuse notes

## rishilahoti/ashby-job-scraper

- URL: `https://github.com/rishilahoti/ashby-job-scraper`
- License observed: MIT + Commons Clause License Condition v1.0.
- Reuse in this repo: Ashby public API pattern, field mapping, and normalization approach.
- We did not copy the database, scheduler, Neon persistence, reporting, or frontend.
- Main API endpoint used:

```txt
https://api.ashbyhq.com/posting-api/job-board/{slug}
```

## MabudAlam/JobsScraper

- URL: `https://github.com/MabudAlam/JobsScraper`
- License observed: no top-level license file in the cloned repo.
- Reuse in this repo: no direct code copy.
- Useful finding: Amazon exposes job search JSON at `https://www.amazon.jobs/en/search.json`.
- Implementation in this repo: independent TypeScript provider scoped to `country=USA`; no code copied.

## alimahmoud7/google-jobs-scraper

- URL: `https://github.com/alimahmoud7/google-jobs-scraper`
- License observed: no top-level license file in the cloned repo.
- Reuse in this repo: no direct code copy.
- Useful finding: Google Careers needs pagination and per-job normalization.
- Why not copied: the repo uses Selenium/ChromeDriver and old Google CSS selectors such as `GXRRIBB-e-G`, which are fragile and not appropriate for the Next.js/Vercel runtime.
- Implementation in this repo: independent TypeScript HTML parser against current Google Careers server-rendered results at:

```txt
https://www.google.com/about/careers/applications/jobs/results/?location=United%20States
```

## ever-jobs/ever-jobs

- URL: `https://github.com/ever-jobs/ever-jobs`
- License observed: MIT.
- Useful finding: its Google Careers provider documents the former `https://careers.google.com/api/v3/search/` endpoint and maps `publish_date`.
- Current verification: that endpoint returned HTTP 404 on August 6, 2026.
- Reuse in this repo: no provider code copied. The current Google page was reverse-engineered directly; publish and update timestamps are read from its server-rendered `AF_initDataCallback` payload. See `docs/google-careers-dates.md`.
