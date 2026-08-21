import { getSnapshot, getAugmentedEntries } from "@/features/jobs/service";
import { decodeCursor, parseSearchParams, searchJobs } from "@/features/jobs/search";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parseSearchParams(Object.fromEntries(url.searchParams));
  const cursorOffset = decodeCursor(url.searchParams.get("cursor"));
  const snapshot = await getSnapshot();
  const entries = await getAugmentedEntries(snapshot, params.q);
  const result = searchJobs(entries, params, cursorOffset);

  return Response.json({
    ...result,
    fetchedAt: snapshot.fetchedAt,
    diagnostics: snapshot.diagnostics,
  });
}
