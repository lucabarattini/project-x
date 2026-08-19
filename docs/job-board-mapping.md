# Job board mapping plan

The scraper started Greenhouse-first and now also supports Ashby, Lever, Workday, Amazon, and Google Careers.

## Current providers

- Greenhouse boards are stored in `data/greenhouse-boards.json`.
- Ashby boards are stored in `data/ashby-boards.json`.
- Lever boards are stored in `data/lever-boards.json`.
- Workday boards are stored in `data/workday-boards.json`.
- Amazon provider config is stored in `data/amazon-boards.json`.
- Target companies from the screenshots are tracked in `data/target-companies.json`.
- Official custom/iCIMS boards are stored in `data/custom-careers-boards.json`.
- Greenhouse jobs are normalized in `src/features/jobs/providers/greenhouse.ts`.
- Ashby jobs are normalized in `src/features/jobs/providers/ashby.ts`.
- Lever jobs are normalized in `src/features/jobs/providers/lever.ts`.
- Workday jobs are normalized in `src/features/jobs/providers/workday.ts`.
- Amazon jobs are normalized in `src/features/jobs/providers/amazon.ts`.
- Posted dates use provider-specific fields: Greenhouse `first_published`, Ashby `publishedAt`, Lever `createdAt`, Workday detail/start date or relative `postedOn`, Amazon `posted_date`, and Google Careers payload timestamps.
- iCIMS, Renaissance, and Cyera currently provide public job links/content but no reliable published/modified timestamp, so those fields remain `Not Stated` in the dashboard.

## Why many companies are missing

The tier-list companies and large tech/finance companies do not all use Greenhouse. Common alternatives:

- Workday
- SmartRecruiters
- iCIMS
- Eightfold
- proprietary career pages
- no public consolidated board

For hedge funds and trading firms, guessing board URLs is especially fragile. The right path is to use a source repo or verified mapping and normalize each provider into the same internal job shape.

## Proposed provider interface

Every provider should return this app-level shape:

```ts
type Job = {
  id: string | number;
  title: string;
  company: string;
  location: string;
  absoluteUrl: string;
  contentText: string;
  postedAt: string | null;
  updatedAt: string | null;
};
```

## Next integration targets

When a source repo is provided, extract mappings in this order:

1. company name
2. ATS/provider
3. board identifier/token or URL
4. stable API endpoint if available
5. date field used for posted date
6. whether the board exposes requirements/content directly

Then add provider fetchers one at a time and tests with raw sample payloads.

## Coverage audit

Run:

```bash
node scripts/audit-target-coverage.mjs
```

This prints covered/missing target companies against the current verified board catalog.

## Project tracking

- ATS discovery findings live in `data/ats-discovery.json`.
- Human-readable integration notes live in `docs/ats-discovery.md`.
- Current board/company counts live in `docs/current-coverage.md`.
- Asana-style task organization lives in `docs/asana-board.md`.

## Rule for adding companies

Do not add a company as "verified" unless one of these is true:

- the API endpoint returns jobs successfully;
- a raw HTML parser test confirms jobs and dates;
- the company has no open jobs but the board URL/API is confirmed valid.

This prevents the app from silently showing fake or stale coverage.
