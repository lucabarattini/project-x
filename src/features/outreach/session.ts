import { createHmac, timingSafeEqual } from "node:crypto";

/** One password, kept in OUTREACH_PASSWORD, signs in to the outreach page and to label corrections. */
export function sessionToken() {
  const password = process.env.OUTREACH_PASSWORD;
  return password ? createHmac("sha256", password).update("outreach-session").digest("hex") : null;
}

export function isSignedIn(request: Request) {
  const expected = sessionToken();
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)outreach=([a-f0-9]{64})/u)?.[1];
  return Boolean(expected && cookie && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected)));
}
