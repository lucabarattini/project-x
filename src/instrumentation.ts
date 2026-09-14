/**
 * Server startup hook (Node runtime). Warms the job snapshot into the data
 * cache — fire-and-forget so it never delays the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { getSnapshot } = await import("@/features/jobs/service");
    void getSnapshot();
  } catch {
    // Snapshot warming is best-effort.
  }
}
