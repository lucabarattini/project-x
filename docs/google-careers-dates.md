# Google Careers posted dates

Google Careers does not currently expose `datePosted` in JSON-LD on the pages sampled by this project. The date is nevertheless present in the server-rendered results HTML.

## Raw source

The current results page contains a script with `class="ds:1"` and an `AF_initDataCallback(...)` payload. Its first data array contains one row per job:

| Field | Meaning | Raw format |
| --- | --- | --- |
| `row[0]` | Stable Google job ID | string |
| `row[12]` | Original publish time | `[epochSeconds, nanoseconds]` |
| `row[13]` | Latest update time | `[epochSeconds, nanoseconds]` |

The job ID is joined to the corresponding result-card URL. The application uses `row[12]` for `postedAt` and keeps `row[13]` as `updatedAt`; it never substitutes the update time for the posting time.

For example, the live payload observed on August 6, 2026 contained:

```text
job id:      82087125486314182
published:   [1783948218, 86000000]  -> 2026-07-13T13:10:18.086Z
updated:     [1786019897, 91000000]  -> 2026-08-06T12:38:17.091Z
```

## Reproduce the check

```bash
npm run verify:google-dates
```

The command paginates the complete live U.S. result set, parses the same raw payload used by the app, fails if any card lacks a publish timestamp, and prints five auditable samples with their Google URLs.

The MIT-licensed `ever-jobs` project was useful corroboration that Google Careers historically exposed a `publish_date` through `careers.google.com/api/v3/search/`. That endpoint currently returns HTTP 404, so this project does not rely on it and independently parses the current server-rendered payload.
