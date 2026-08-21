import { isHiringPostsViewer } from "@/features/hiring-posts/access";
import { readHiringPostFeed } from "@/features/hiring-posts/apify";
import { reclassifyHiringPost } from "@/features/hiring-posts/normalize";

export const dynamic = "force-dynamic";

/**
 * Returns the full text (and match reasons) for posts that were shipped as
 * metadata-only in the page payload. Batched: ?ids=a,b,c
 */
export async function GET(request: Request) {
  if (!await isHiringPostsViewer()) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parameters = new URL(request.url).searchParams;
  const ids = (parameters.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) {
    return Response.json({ posts: [] });
  }

  const feed = await readHiringPostFeed();
  const wanted = new Set(ids);
  const posts: Record<string, { content: string; reasons: string[]; exclusionReasons: string[] }> = {};

  for (const post of feed.posts) {
    if (!wanted.has(post.id)) continue;
    const reclassified = reclassifyHiringPost(post);
    posts[post.id] = {
      content: reclassified.content ?? "",
      reasons: reclassified.reasons ?? [],
      exclusionReasons: reclassified.exclusionReasons ?? [],
    };
  }

  return Response.json({ posts });
}
