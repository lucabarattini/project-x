import { getSnapshot } from "@/features/jobs/service";
import { decodeCursor, parseSearchParams, searchJobs } from "@/features/jobs/search";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parseSearchParams(Object.fromEntries(url.searchParams));
  const cursorOffset = decodeCursor(url.searchParams.get("cursor"));
  const snapshot = await getSnapshot();
  const result = searchJobs(snapshot.entries, params, cursorOffset);

  return Response.json({
    ...result,
    fetchedAt: snapshot.fetchedAt,
    diagnostics: snapshot.diagnostics,
  });
}
