# Current coverage

Generated after integrating Greenhouse, Ashby, Lever, Workday, iCIMS, official custom careers pages, Amazon, and Google Careers.

## Definitions

- **Board**: one configured source endpoint that returns jobs for one company/provider pair. Examples: one Greenhouse token, one Ashby slug, or the Amazon U.S. search endpoint.
- **Board company**: unique company represented by at least one configured board.
- **Live company**: unique company that returned at least one job in the latest runtime fetch.
- **Target company**: company listed in `data/target-companies.json`, derived from the screenshots.

## Current counts

Using Amazon capped at 300 latest U.S. jobs for MVP payload control:

| Metric | Count |
| --- | ---: |
| Configured boards | 82 |
| Unique board companies | 79 |
| Live jobs loaded | Dynamic; shown from the latest provider snapshot |
| Live companies | Dynamic; shown from the latest provider snapshot |
| Amazon jobs included after Amazon-specific filters | 233 |
| Google jobs included | ~2,050 current U.S. listing cards |
| Target companies covered | 67 / 75 |
| Target companies missing | 8 / 75 |
| High-priority target companies missing | 6 |

## High-priority missing targets

- Citadel Securities
- Citadel
- Hudson River Trading
- Two Sigma
- D. E. Shaw
- Millennium

## Next low-hanging fruit

1. **Official site iframe/embed discovery** for hedge funds and trading firms. Optiver proved this works: the obvious token was wrong, but the real Greenhouse token was visible in the embedded apply iframe.
2. **Manual careers-page pass for quant firms**:
   - Citadel / Citadel Securities
   - Two Sigma — current DOM evidence shows a custom careers portal (`careers.twosigma.com`, `portal-data`, `synapseBootstrap`, `customPortal_106`, `/portalpacks/...`) rather than a simple Greenhouse/Ashby token. Next step is to inspect Network/XHR calls for a stable JSON endpoint.
   - D. E. Shaw
   - Hudson River Trading
   - Millennium
3. **Provider-specific integrations after evidence**:
   - SmartRecruiters only after official careers-page confirmation because API slug probing produced noisy false positives.
   - Custom career pages for large finance firms.

## Ashby note

Mistral AI and Thinking Machines Lab are now live through Ashby.

Wispr Flow is live through its official Ashby board with 25 verified listings.

Midjourney, Mercor, and Listen Labs are live through their official Ashby boards
with 20, 78, and 28 verified listings respectively.

Fal is live through its official Ashby board with 31 verified listings.

Fireworks AI and Gamma are live through their official Ashby boards with 54 and
33 verified listings respectively.

Legora is live through its public Ashby board with 279 verified listings.

Safe Superintelligence is configured with the correct Ashby slug (`ssi`), but `https://api.ashbyhq.com/posting-api/job-board/ssi` currently returns `jobs: []`. The supplied direct job URL is active, but the public board API does not enumerate jobs yet.

## Lever note

TGS Management is configured through Lever at `https://api.lever.co/v0/postings/tgsmc?mode=json`. The endpoint is verified but currently returns an empty list.

## Workday note

Arrowstreet Capital is live through Workday CXS. The app posts to the public search endpoint and fetches each public detail JSON page for description text.

## Greenhouse additions

DRW, SambaNova, Radix Trading, Five Rings, and Skild AI are live through public Greenhouse boards.

## Logo note

Logo generation now records provenance in `data/company-logo-sources.json`.

- Simple Icons: 20
- Domain/favicon-derived: 44
- Fallback initials: 1 (`Safe Superintelligence`)

## Amazon note

Amazon is now live through `https://www.amazon.jobs/en/search.json` with `country=USA`, `normalized_country_code=USA`, and `sort=recent`.

The app currently fetches the latest 300 U.S. Amazon jobs, then applies Amazon-specific scope rules:

- include Individual Contributor-style roles;
- include corporate, student-program, or remote jobs;
- exclude fulfillment center / warehouse / operations-management jobs;
- exclude obvious people-manager titles while preserving common IC titles such as Program Manager, Product Manager, Project Manager, and Account Manager.

This yielded 233 Amazon jobs in the latest local verification.

## Google Careers note

Google is now live through server-rendered Google Careers HTML:

```txt
https://www.google.com/about/careers/applications/jobs/results/?location=United%20States
```

The app now paginates the full Google U.S. result set instead of stopping at the old MVP cap of 120 jobs. In local verification on August 6, 2026, Google returned 103 result pages and ~2,050 listing cards.

Google dates now come from the server-rendered `AF_initDataCallback` payload on each result page. The raw job row stores the original publish timestamp at index 12 and the update timestamp at index 13, both as protobuf `[epoch seconds, nanoseconds]` pairs. The app maps the publish timestamp to `postedAt`, so Google roles now work with Today and 7 days filters. See `docs/google-careers-dates.md` and run `npm run verify:google-dates` for a live, auditable check.
