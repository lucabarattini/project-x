import "server-only";

import { cookies } from "next/headers";
import { matchesHiringPostsViewerCookie, hiringPostsViewerCookie } from "./view-key";

export {
  hiringPostsViewerCookie,
  hiringPostsViewerCookieValue,
  hiringPostsViewerMaxAge,
  isHiringPostsViewingConfigured,
  matchesHiringPostsViewKey,
} from "./view-key";

/** Whether this request carries a valid hiring-signal viewer cookie. */
export async function isHiringPostsViewer() {
  const store = await cookies();
  return matchesHiringPostsViewerCookie(store.get(hiringPostsViewerCookie)?.value);
}
