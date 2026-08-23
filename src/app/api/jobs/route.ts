import { fetchLatestJobs, jobBoards } from "@/features/jobs/service";

// Cold snapshot builds can run longer than Vercel's default function limit.
export const maxDuration = 120;

export async function GET() {
  const jobs = await fetchLatestJobs();

  return Response.json({
    refreshedAt: new Date().toISOString(),
    boards: jobBoards.length,
    jobs,
  });
}
