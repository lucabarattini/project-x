import { gunzipSync, gzipSync } from "node:zlib";
import { get, put } from "@vercel/blob";

export const boardPath = "board/board.json.gz";
export const recentPath = "board/recent.json.gz";
export const labelsPath = "board/labels.json.gz";
export const correctionsPath = "board/corrections.json.gz";
export const judgeStatsPath = "board/judge-stats.json.gz";
export const alertsPath = "board/alerts.json.gz";

/** The judge only reads postings this recent, counted from the visit. */
export const judgeWindowMs = 14 * 24 * 60 * 60 * 1000;
/** One day longer, because a board can be hours old when it is read. */
export const recentWindowMs = judgeWindowMs + 24 * 60 * 60 * 1000;

export async function readStored<T>(path: string): Promise<T | null> {
  const result = await get(path, { access: "private", useCache: false }).catch(() => null);
  if (result?.statusCode !== 200) return null;
  const gzipped = Buffer.from(await new Response(result.stream).arrayBuffer());
  return JSON.parse(gunzipSync(gzipped).toString("utf8")) as T;
}

export async function writeStored(path: string, value: unknown) {
  await put(path, gzipSync(JSON.stringify(value)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/gzip",
  });
}
