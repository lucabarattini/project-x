import { judgeNext, judgeStatus } from "@/features/jobs/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json(await judgeStatus());
}

export async function POST() {
  return Response.json(await judgeNext());
}
