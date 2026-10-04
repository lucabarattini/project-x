import { getSnapshot, getSearchEntries } from "@/features/jobs/service";
import { decodeCursor, parseSearchParams, searchJobs } from "@/features/jobs/search";

// Cold snapshot builds can run longer than Vercel's default function limit.
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parseSearchParams(Object.fromEntries(url.searchParams));
  const cursorOffset = decodeCursor(url.searchParams.get("cursor"));
  const snapshot = await getSnapshot();
  const entries = await getSearchEntries(snapshot, params);
  const result = searchJobs(entries, params, cursorOffset);

  return Response.json({
    ...result,
    fetchedAt: snapshot.fetchedAt,
    diagnostics: snapshot.diagnostics,
  });
}
