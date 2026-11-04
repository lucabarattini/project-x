import { get } from "@vercel/blob";
import { boardPath } from "@/features/jobs/board-store";

export const dynamic = "force-dynamic";

/** The stored board, passed through still gzipped: the function does no work on it. */
export async function GET() {
  const result = await get(boardPath, { access: "private", useCache: false }).catch(() => null);
  if (result?.statusCode !== 200) return new Response(null, { status: 404 });
  return new Response(result.stream, {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      "cache-control": "public, s-maxage=600",
    },
  });
}
