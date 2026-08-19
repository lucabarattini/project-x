import { isAuthorizedHiringPostRequest } from "@/features/hiring-posts/auth";
import { hiringPostCompanyBatches } from "@/features/hiring-posts/search-config";
import { refreshHiringPosts } from "@/features/hiring-posts/service";

type RefreshBody = {
  window?: unknown;
  maxPosts?: unknown;
  companyBatch?: unknown;
};

export async function POST(request: Request) {
  if (!isAuthorizedHiringPostRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RefreshBody = {};
  try {
    body = await request.json() as RefreshBody;
  } catch {
    // An empty body means the normal 24-hour incremental refresh.
  }

  const window = body.window === "week" ? "week" : "24h";
  const requestedMax = typeof body.maxPosts === "number" ? Math.floor(body.maxPosts) : null;
  const maxPosts = Math.min(100, Math.max(1, requestedMax ?? (window === "week" ? 100 : 10)));
  const requestedBatch = typeof body.companyBatch === "number"
    ? Math.floor(body.companyBatch)
    : 0;
  const companyBatch = Math.min(
    hiringPostCompanyBatches.length - 1,
    Math.max(0, requestedBatch),
  );

  try {
    const feed = await refreshHiringPosts(window, maxPosts, companyBatch);
    return Response.json({
      ok: true,
      window,
      maxPosts,
      companyBatch,
      updatedAt: feed.updatedAt,
      posts: feed.posts.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 502 },
    );
  }
}
