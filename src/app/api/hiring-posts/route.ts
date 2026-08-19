import { isHiringPostsViewer } from "@/features/hiring-posts/access";
import { isAuthorizedHiringPostRequest } from "@/features/hiring-posts/auth";
import { getHiringPostPageData } from "@/features/hiring-posts/service";

/**
 * The feed contains identifiable people, so it is never public. Readers are
 * either a human holding the viewer cookie or a machine presenting the shared
 * secret; everyone else gets a 401 with no hint about how much data exists.
 */
export async function GET(request: Request) {
  const allowed = await isHiringPostsViewer() || isAuthorizedHiringPostRequest(request);
  if (!allowed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getHiringPostPageData();
  return Response.json(data, {
    headers: { "cache-control": "private, no-store" },
  });
}
