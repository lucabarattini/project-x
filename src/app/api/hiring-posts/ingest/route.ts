import {
  expectedApifyTaskId,
  rotateLinkedinPostSearchTaskAfterRun,
} from "@/features/hiring-posts/apify";
import { isAuthorizedHiringPostRequest } from "@/features/hiring-posts/auth";
import { ingestActorRun } from "@/features/hiring-posts/service";

type WebhookPayload = {
  eventData?: {
    actorRunId?: unknown;
    actorTaskId?: unknown;
  };
  resource?: {
    id?: unknown;
    actorTaskId?: unknown;
  };
};

export async function POST(request: Request) {
  if (!isAuthorizedHiringPostRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json() as WebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = payload.eventData?.actorRunId ?? payload.resource?.id;
  const taskId = payload.eventData?.actorTaskId ?? payload.resource?.actorTaskId;
  if (typeof runId !== "string") {
    return Response.json({ error: "Missing Actor run ID" }, { status: 400 });
  }

  const expectedTaskId = expectedApifyTaskId();
  if (expectedTaskId && taskId !== expectedTaskId) {
    return Response.json({ error: "Unexpected Actor task" }, { status: 403 });
  }

  try {
    const feed = await ingestActorRun(runId);
    const nextCompanyBatch = await rotateLinkedinPostSearchTaskAfterRun(runId);
    return Response.json({
      ok: true,
      runId,
      nextCompanyBatch,
      updatedAt: feed.updatedAt,
      posts: feed.posts.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 502 },
    );
  }
}
