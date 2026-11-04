import { judgeLabels } from "@/features/jobs/display";
import { correctLabel, judgeNext, judgeStatus } from "@/features/jobs/judge";
import { isSignedIn } from "@/features/outreach/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return Response.json({ ...await judgeStatus(), signedIn: isSignedIn(request) });
}

export async function POST() {
  return Response.json(await judgeNext());
}

/** A correction steers the judge, so unlike scoring it needs the outreach sign-in. */
export async function PUT(request: Request) {
  if (!isSignedIn(request)) return new Response(null, { status: 401 });
  const { key, title, company, label } = await request.json() as Record<string, string>;
  if (!key || !title || !company || !judgeLabels.includes(label)) return new Response(null, { status: 400 });
  await correctLabel(key, { title, company, label });
  return new Response(null, { status: 204 });
}
