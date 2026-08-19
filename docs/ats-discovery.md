# ATS discovery notes

Current low-hanging fruit from the missing target companies:

## Already added via Greenhouse

These use the same Greenhouse integration already in the app:

| Company | Greenhouse token | Verified jobs |
| --- | --- | ---: |
| PDT Partners | `pdtpartners` | 10 |
| Point72 | `point72` | 231 |
| Jump Trading | `jumptrading` | 105 |
| Quadrature Capital | `quadraturecapital` | 4 |
| Virtu Financial | `virtu` | 46 |
| Tower Research Capital | `towerresearchcapital` | 74 |
| AQR | `aqr` | 46 |

## Corrected Greenhouse tokens

| Company | Previous token | Correct token | Reason |
| --- | --- | --- | --- |
| Optiver | `optiver` | `optiverus` | Optiver embeds Greenhouse with `for=optiverus`; `optiver` returns 0 jobs while `optiverus` returns active jobs. |

## Integrated next provider: Ashby

Ashby is now integrated as a second live provider. The implementation was based on the public API pattern and normalization approach from `rishilahoti/ashby-job-scraper`.

Verified Ashby API shape:

```txt
https://api.ashbyhq.com/posting-api/job-board/{slug}
```

Live Ashby candidates:

| Company | Ashby slug | Verified jobs |
| --- | --- | ---: |
| OpenAI | `openai` | 734 |
| Harvey | `harvey` | 360 |
| Fal | `fal-ai` | 31 |
| Fireworks AI | `fireworks` | 54 |
| Gamma | `gamma` | 33 |
| Mercor | `mercor` | 78 |
| Listen Labs | `listenlabs` | 28 |
| Midjourney | `midjourney` | 20 |
| Crusoe | `crusoe` | 351 |
| ElevenLabs | `elevenlabs` | 228 |
| Sierra | `sierra` | 192 |
| Cohere | `cohere` | 142 |
| Decagon | `decagon` | 123 |
| Cursor | `cursor` | 112 |
| EliseAI | `eliseai` | 100 |
| Notion | `notion` | 119 |
| Perplexity | `perplexity` | 89 |
| Replit | `replit` | 88 |
| Cognition | `cognition` | 75 |
| Baseten | `baseten` | 64 |
| Voleon | `voleon` | 57 |
| Abridge | `abridge` | 43 |
| Physical Intelligence | `physicalintelligence` | 29 |
| Applied Intuition | `applied` | 258 |
| Chai Discovery | `chaidiscovery` | 14 |
| Clay | `claylabs` | 75 |
| Mistral AI | `mistral.ai` | 167 |
| Thinking Machines Lab | `ThinkingMachines` | 35 |
| Safe Superintelligence | `ssi` | 0 |
| Wispr Flow | `wispr-flow` | 25 |

## Candidate boards not yet integrated

| Company | Likely provider | Evidence | Status |
| --- | --- | --- | --- |
| Two Sigma | Custom portal | DOM shows `careers.twosigma.com` with `portal-data`, `synapseBootstrap`, `customPortal_106`, and `/portalpacks/...` assets. | Inspect Network/XHR for stable JSON endpoint before implementing. |

## Special cases

| Company | Correct URL | Runtime behavior |
| --- | --- | --- |
| Safe Superintelligence | `https://jobs.ashbyhq.com/ssi` | Correct board slug, but Ashby API currently returns `jobs: []`. The direct job URL supplied by the user is active, but the public board list is empty. |

## Needs manual verification

## Amazon

`MabudAlam/JobsScraper` shows Amazon can be scraped through:

```txt
https://www.amazon.jobs/en/search.json
```

The referenced implementation queries `country=IND`. This app implements Amazon independently and uses `country=USA`. Do not copy code directly from that repo unless a license is added or permission is clear.

SmartRecruiters probe results were noisy because many slugs returned successful responses that may not correspond to the intended company. Do not add SmartRecruiters candidates until checking the official careers page.

## Google Careers

`alimahmoud7/google-jobs-scraper` showed the older Selenium-based approach: paginate Google Careers, open each job, then normalize title/location/requirements.

The repo has no top-level license file and relies on old CSS selectors, so this app does **not** copy that implementation. It uses an independent TypeScript parser against the current server-rendered Google Careers results page:

```txt
https://www.google.com/about/careers/applications/jobs/results/?location=United%20States
```

The provider now paginates the full U.S. result set. Local verification on August 6, 2026 returned 103 pages and ~2,050 listing cards.

Date limitation: the parser supports JSON-LD `datePosted`, but the sampled Google job detail page did not contain `application/ld+json` or `datePosted` in either server-fetched HTML or Chrome-rendered DOM. Google jobs are therefore included with `postedAt: null` until a trustworthy date source is visible.

Manual-check bucket:

- Citadel / Citadel Securities
- Two Sigma
- D. E. Shaw
- DRW
- Hudson River Trading
- Millennium
- Renaissance Technologies
- Radix Trading
- TGS Management
- Arrowstreet Capital
- XTX Markets
- Susquehanna International Group
- Five Rings
- Cyera
- Fal
- SambaNova
- Skild AI
