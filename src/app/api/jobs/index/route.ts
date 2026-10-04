import { getSnapshot } from "@/features/jobs/service";
import { toIndexRow } from "@/features/jobs/search-model";

// Cold snapshot builds can run longer than Vercel's default function limit.
export const maxDuration = 120;

/**
 * Every snapshot entry as a compact row, so the dashboard filters in the
 * browser instead of making a request per click. The CDN keeps it for the
 * snapshot's own 5 minutes and serves the old copy while it refreshes.
 */
export async function GET() {
  const snapshot = await getSnapshot();
  return Response.json(
    { fetchedAt: snapshot.fetchedAt, rows: snapshot.entries.map(toIndexRow) },
    { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=86400" } },
  );
}
