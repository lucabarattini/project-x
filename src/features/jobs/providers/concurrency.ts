/**
 * Fans out over `items` with a bounded worker pool and stops handing out new
 * work once the run deadline passes. Providers that page a large board share
 * this: `runProvider` discards every job when its timeout fires, so returning
 * partial results beats returning none.
 */
export async function mapWithinDeadline<T, R>(
  items: T[],
  limit: number,
  startedAt: number,
  deadlineMs: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (Date.now() - startedAt > deadlineMs) {
        return;
      }
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Page fan-out is only safe once the board has told us how many rows exist,
 * so every paging provider reads page one first and derives the rest from the
 * reported total. Serverless runs stay on a smaller pool: datacenter IPs draw
 * rate limiting sooner than a laptop does.
 */
export const pageConcurrency = process.env.VERCEL === "1" ? 8 : 12;

/**
 * Pool for boards that need one request per posting rather than one per page
 * of postings. The work is the same wall-clock budget spread over ~20x more
 * requests, so the pool is wider — but still narrower in serverless.
 */
export const detailConcurrency = process.env.VERCEL === "1" ? 16 : 24;
