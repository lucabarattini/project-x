# Job radar Asana-style board

Use this as the repo-local project board. It can be copied into Asana if/when an Asana connection is available.

## Sections

### Now

- Verify Vercel deployment after Greenhouse, Ashby, Lever, and Workday aggregation.
- Monitor client payload size now that the live app loads thousands of jobs.
- Verify Amazon U.S.-only results in production.

### Next

- Add pagination/server-side filtering if Amazon payload becomes too large.
- Add provider badges in the board sidebar.

### Validate

- Run `npm test`.
- Run `npm run lint`.
- Run `node scripts/audit-target-coverage.mjs`.
- Run a real provider count check before calling a board verified.

### Later

- Manual-check SmartRecruiters candidates against official careers pages.
- Investigate Workday/custom career pages for hedge funds not covered by Greenhouse.
- Add server-side pagination if loading all jobs becomes too heavy for the client.

## Definition of done for a new provider

- Provider fetcher returns the app-level job shape.
- Posted date source is explicitly documented.
- At least one raw payload test exists.
- Target companies are represented in a data file, not hardcoded in code.
- The UI shows provider/company without breaking existing Greenhouse behavior.
