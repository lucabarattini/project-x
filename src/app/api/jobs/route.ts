import { fetchLatestJobs, jobBoards } from "@/features/jobs/service";

export async function GET() {
  const jobs = await fetchLatestJobs();

  return Response.json({
    refreshedAt: new Date().toISOString(),
    boards: jobBoards.length,
    jobs,
  });
}
