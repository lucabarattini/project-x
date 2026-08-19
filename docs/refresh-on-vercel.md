# Refresh behavior on Vercel

## What the app does today

The app does **not** run a global background scraper every 5 minutes.

Current behavior:

1. When a user opens the page, the Next.js server component calls `fetchLatestJobs()`.
2. Provider fetches use `next: { revalidate: 300 }`, so Vercel can cache each upstream request for roughly 5 minutes.
3. In the browser, `JobDashboard` runs `setInterval(..., 5 * 60 * 1000)` and calls `router.refresh()`.
4. If the page is open, the browser asks Vercel for fresh server-rendered data every 5 minutes.

This is polling, not push/live streaming.

## What this means

- If the page is open, it requests a fresh server render about every 5 minutes.
- If nobody has the page open, nothing proactively runs.
- The “last checked” time is the browser refresh time, not proof that every upstream job board changed.
- Vercel/Next may serve cached provider responses within the 300 second revalidate window.

## If we want true background refresh

Add a Vercel Cron route, for example:

```txt
/api/refresh-jobs
```

That route should:

1. call `fetchLatestJobs()`;
2. store the result in persistent storage;
3. make the UI read from that stored snapshot.

Without storage, a cron can warm the cache but cannot guarantee a durable latest snapshot for every user.
