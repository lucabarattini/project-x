import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  hiringPostsViewerCookie,
  hiringPostsViewerCookieValue,
  hiringPostsViewerMaxAge,
  isHiringPostsViewingConfigured,
  matchesHiringPostsViewKey,
} from "@/features/hiring-posts/access";

/**
 * Exchanges HIRING_POSTS_VIEW_KEY for a viewer cookie:
 *   /api/hiring-posts/unlock?key=<HIRING_POSTS_VIEW_KEY>  unlocks
 *   /api/hiring-posts/unlock?lock=1                       locks again
 * Cookies can only be written from a Route Handler or Server Function, which is
 * why the page itself cannot accept the key.
 */
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const store = await cookies();

  if (parameters.get("lock") !== null) {
    store.delete(hiringPostsViewerCookie);
    redirect("/hiring-posts");
  }

  if (!isHiringPostsViewingConfigured()) {
    return Response.json(
      { error: "HIRING_POSTS_VIEW_KEY is not configured" },
      { status: 404 },
    );
  }

  if (!matchesHiringPostsViewKey(parameters.get("key"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  store.set(hiringPostsViewerCookie, hiringPostsViewerCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: hiringPostsViewerMaxAge,
  });

  redirect("/hiring-posts");
}
