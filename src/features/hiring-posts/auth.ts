import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedHiringPostRequest(request: Request) {
  const expected = process.env.HIRING_POSTS_WEBHOOK_SECRET?.trim();
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "") ?? "";
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

