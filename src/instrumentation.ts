/**
 * Server startup hook (Node runtime). Warms the job snapshot into the data
 * cache and self-heals hiring-signal author photos stripped by an older
 * deployment — both fire-and-forget so they never delay the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { getSnapshot } = await import("@/features/jobs/service");
    void getSnapshot();
  } catch {
    // Snapshot warming is best-effort.
  }

  try {
    const { backfillAuthorPhotos } = await import("@/features/hiring-posts/photo-backfill");
    void backfillAuthorPhotos();
  } catch {
    // Photo backfill is best-effort and no-ops when the feed is healthy.
  }
}
