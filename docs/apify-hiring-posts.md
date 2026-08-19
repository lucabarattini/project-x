# Apify setup for Hiring Manager Posts

This setup uses Apify as both the LinkedIn post source and the small persistent
store for the seven-day feed. It does not use a Google or web-search fallback.

## 1. Create the persistent store

1. In Apify Console, open **Storage → Key-value stores**.
2. Create a store named `hiring-posts`.
3. Open it and copy its **ID**. This becomes `APIFY_STORE_ID`.

The application writes one JSON record named `HIRING_POSTS_FEED`. Do not create
that record manually.

## 2. Create the scheduled Actor task

1. Open the `harvestapi/linkedin-post-search` Actor.
2. Select the **Input → JSON** tab.
3. Start with a valid input containing the hiring queries, a 24-hour window,
   and `maxPosts: 10`.
4. Click **Save as a new task** and name it `hiring-posts-daily`.
5. Open the saved task and copy its internal **Task ID**. This becomes
   `APIFY_TASK_ID`.

The repository derives the author-company filter from every configured job
board. It currently contains 87 companies and automatically includes companies
added to those board files later. The Actor accepts at most 20 values in
`authorsCompanies`, so the repository distributes the list across five balanced
batches. After `.env.local` is configured, synchronize the first batch with:

```bash
npm run sync:apify-hiring
```

After every successful run, the webhook reads the immutable input used by that
run and moves the task to the next batch. This makes webhook retries idempotent.
`npm run sync:apify-hiring` reads the task's current input first and rewrites it
in place, so a manual re-sync never restarts the rotation at the first batch.

**`maxPosts` is applied per search query, not per run.** The ceiling for a
31-day month is therefore `runs x queries x maxPosts`. With the three query
families in `search-config.ts`, `maxPosts: 10`, and a run every four hours that
is `186 x 3 x 10 = 5,580` posts, or about $11.16 at the conservative $2 per
1,000 posts price. Dropping to a single query family costs 1,860 posts (~$3.72).
`projectedMonthlyPostMaximum()` computes the current ceiling, and
`npm run sync:apify-hiring` prints it. Override the per-query cap with
`HIRING_POSTS_MAX_POSTS`. Comments and reactions stay off because they cost
extra and are not needed for outreach discovery.

Because `sortBy` is `date`, a batch containing high-volume employers can consume
the whole per-query allowance before smaller companies appear. Raising
`maxPosts` on a narrower query set buys more coverage than adding query families,
which mostly re-scrape overlapping authors.

### How company matching works

Company matching has two layers:

1. Apify receives the current `authorsCompanies` batch, with at most 20 canonical
   names derived from the Job Radar board files. This limits discovery to posts
   authored by people whose LinkedIn company metadata belongs to that batch; it
   does not rely on the company merely being mentioned in the body.
2. The application verifies and labels each result from a known career URL,
   the author's current headline, and finally the post text. Comparisons use
   Unicode normalization, lowercase matching, punctuation removal, and aliases,
   so `Amazon`, `AMAZON`, `amazon`, and stylized Unicode text resolve to the same
   company. Phrases such as `ex-Google`, `former Amazon`, and `previously at`
   are removed before current-affiliation matching.

This intentionally favors precision. An external agency recruiter may be
missed if LinkedIn does not associate the author with a tracked company; the
MVP accepts that tradeoff instead of paying to scan the full LinkedIn index.

## 3. Configure the application secrets

Generate a webhook secret locally:

```bash
openssl rand -hex 32
```

Copy `.env.example` to `.env.local` and fill it in. Never commit this file or
paste a value into a chat, an issue, or a task description:

```dotenv
APIFY_TOKEN=your_apify_api_token
APIFY_STORE_ID=the_key_value_store_id
APIFY_TASK_ID=the_saved_task_id
HIRING_POSTS_WEBHOOK_SECRET=the_random_secret_from_openssl
HIRING_POSTS_VIEW_KEY=a_second_independent_random_secret
```

Use a different value for `HIRING_POSTS_VIEW_KEY` so handing someone read access
to the feed never also hands them ingest access.

For Vercel, first update the CLI and then add the same values to the Production
environment:

```bash
npm i -g vercel@latest
vercel env add APIFY_TOKEN production
vercel env add APIFY_STORE_ID production
vercel env add APIFY_TASK_ID production
vercel env add HIRING_POSTS_WEBHOOK_SECRET production
vercel env add HIRING_POSTS_VIEW_KEY production
vercel --prod
```

### Reading the feed

The feed is personal data — named people, their photos, their profile links and
the text they wrote — so `/hiring-posts` and `GET /api/hiring-posts` are never
public. Unlock a browser once:

```
https://YOUR_DEPLOYMENT/api/hiring-posts/unlock?key=YOUR_HIRING_POSTS_VIEW_KEY
```

That sets an `HttpOnly` cookie holding a SHA-256 digest of the key, valid for 30
days. `?lock=1` clears it, and rotating `HIRING_POSTS_VIEW_KEY` invalidates every
cookie already issued. With no key configured the route stays locked for
everyone, which is what a fresh clone of this repository does by default.
Machine callers may instead present `HIRING_POSTS_WEBHOOK_SECRET` in the
`Authorization` header.

## 4. Run the one-time D−7 backfill

After the four environment variables are present, start the app locally with
`npm run dev` or use the deployed production URL. Run each of the five batches
exactly once:

```bash
for batch in 0 1 2 3 4; do
  curl -fsS -X POST 'http://localhost:3000/api/hiring-posts/refresh' \
    -H 'Authorization: Bearer REPLACE_WITH_HIRING_POSTS_WEBHOOK_SECRET' \
    -H 'Content-Type: application/json' \
    --data "{\"window\":\"week\",\"maxPosts\":20,\"companyBatch\":${batch}}"
done
```

For production, replace `http://localhost:3000` with the deployment origin. A
successful response contains `"ok":true`. Open `/hiring-posts` and confirm that
cards appear. Do not repeat this five-batch backfill: the application retains a
rolling seven-day feed by merging and deduplicating incremental results.

## 5. Connect the successful-run webhook

Do this after the production deployment exists:

1. Open the `hiring-posts-daily` task in Apify.
2. Open **Integrations → Webhooks** and create a webhook.
3. Select the event **Actor run succeeded** (`ACTOR.RUN.SUCCEEDED`).
4. Set the request URL to
   `https://YOUR_DEPLOYMENT/api/hiring-posts/ingest`.
5. Add this request header, using the same secret as the application:

```json
{
  "Authorization": "Bearer REPLACE_WITH_HIRING_POSTS_WEBHOOK_SECRET"
}
```

6. Leave Apify's default webhook payload in place. It includes
   `eventData.actorRunId` and `eventData.actorTaskId`, which the endpoint checks.
7. Save the webhook.

The endpoint is idempotent: if Apify retries the same successful run, the feed
does not duplicate its posts or skip a company batch. After ingestion, it moves
the task to the batch following the one used by that completed run. Newly
configured companies enter the generated batches automatically after deployment.

## 6. Schedule the task

1. In Apify Console, open **Schedules** and create a schedule named
   `hiring-posts-every-4-hours`.
2. Use cron expression `0 */4 * * *`.
3. Add the `hiring-posts-daily` task as the action.
4. Enable the schedule. New schedules may initially be disabled.
5. Run the task once manually and verify that:
   - the run succeeds;
   - the webhook receives a successful response;
   - `/hiring-posts` shows an updated timestamp.

Every run searches one batch over the last 24 hours. Five batches complete in
20 hours, giving every company a four-hour overlap that protects against delayed
indexing. The feed removes duplicate post IDs and repeated content.

## What the MVP keeps and rejects

- It keeps direct hiring-manager posts and recruiter posts, while labeling them
  separately.
- It prioritizes non-engineering US roles from every company configured in the
  Job Radar board files.
- It excludes explicit non-US locations and technical/engineering roles.
- It sends only direct-team or recruiter posts with uncertain location or role
  details to **Verify manually**. Vague employee shares are archived.
- It can recover link-only posts when Apify returns a LinkedIn job-card article.
  Allowlisted company career links are enriched from their structured job
  metadata; arbitrary shortened links are never fetched by the server.
