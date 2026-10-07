import { fetchLatestJobs, jobBoards } from "@/features/jobs/service";

// The snapshot rebuild (~2 min, all providers at once) runs after the response
// inside this function, so it needs Vercel's full 300 s.
export const maxDuration = 300;

export async function GET() {
  const jobs = await fetchLatestJobs();

  return Response.json({
    refreshedAt: new Date().toISOString(),
    boards: jobBoards.length,
    jobs,
  });
}
