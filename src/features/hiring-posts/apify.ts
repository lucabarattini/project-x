import "server-only";

import {
  apifyApiBase,
  apifyId,
  authorizationHeaders,
  readHiringPostFeed,
  writeHiringPostFeed,
} from "./apify-client";
import {
  buildLinkedinPostSearchInput,
  nextHiringPostCompanyBatchIndex,
  type HiringPostSearchWindow,
} from "./search-config";
import type { ApifyLinkedinPost } from "./types";

export { readHiringPostFeed, writeHiringPostFeed };

export function isApifyConfigured() {
  return Boolean(process.env.APIFY_TOKEN?.trim() && process.env.APIFY_STORE_ID?.trim());
}

export function expectedApifyTaskId() {
  return process.env.APIFY_TASK_ID?.trim() || null;
}

export async function fetchActorRunPosts(runId: string): Promise<ApifyLinkedinPost[]> {
  const id = apifyId(runId, "Actor run ID");
  const response = await fetch(
    `${apifyApiBase}/actor-runs/${id}/dataset/items?clean=true&format=json`,
    { cache: "no-store", headers: authorizationHeaders() },
  );
  if (!response.ok) throw new Error(`Apify dataset read failed with ${response.status}`);
  const value = await response.json() as unknown;
  if (!Array.isArray(value)) throw new Error("Apify dataset did not return an array");
  return value as ApifyLinkedinPost[];
}

export type SearchWindow = Extract<HiringPostSearchWindow, "24h" | "week">;

async function actorRunInput(runId: string) {
  const id = apifyId(runId, "Actor run ID");
  const runResponse = await fetch(
    `${apifyApiBase}/actor-runs/${id}`,
    { cache: "no-store", headers: authorizationHeaders() },
  );
  if (!runResponse.ok) {
    throw new Error(`Apify run read failed with ${runResponse.status}`);
  }

  const run = await runResponse.json() as {
    data?: { defaultKeyValueStoreId?: unknown };
  };
  if (typeof run.data?.defaultKeyValueStoreId !== "string") {
    throw new Error("Apify run did not expose its input store");
  }

  const storeId = apifyId(run.data.defaultKeyValueStoreId, "Actor run input store ID");
  const inputResponse = await fetch(
    `${apifyApiBase}/key-value-stores/${storeId}/records/INPUT`,
    { cache: "no-store", headers: authorizationHeaders() },
  );
  if (!inputResponse.ok) {
    throw new Error(`Apify run input read failed with ${inputResponse.status}`);
  }
  return inputResponse.json() as Promise<{
    authorsCompanies?: unknown;
    postedLimit?: unknown;
    maxPosts?: unknown;
  }>;
}

const searchWindows: HiringPostSearchWindow[] = ["1h", "24h", "week"];

function asSearchWindow(value: unknown) {
  return searchWindows.find((window) => window === value);
}

function asMaxPosts(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export async function syncLinkedinPostSearchTask(
  companyBatchIndex = 0,
  tuning: { postedLimit?: HiringPostSearchWindow; maxPosts?: number } = {},
) {
  const taskId = expectedApifyTaskId();
  if (!taskId) return false;
  const input = buildLinkedinPostSearchInput(
    tuning.postedLimit ?? "24h",
    tuning.maxPosts,
    companyBatchIndex,
  );
  const response = await fetch(
    `${apifyApiBase}/actor-tasks/${encodeURIComponent(taskId)}/input`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        ...authorizationHeaders(),
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`Apify task input sync failed with ${response.status}: ${message}`);
  }
  return {
    batchIndex: companyBatchIndex,
    companyCount: input.authorsCompanies.length,
    postedLimit: input.postedLimit,
    maxPosts: input.maxPosts,
  };
}

/**
 * Advances the company batch after a run. postedLimit and maxPosts are carried
 * over from the run that just finished: this writes the whole task input, so
 * rebuilding them from defaults silently reverted anything tuned in the Apify
 * console — a widened backfill window lasted until the next run and no further.
 */
export async function rotateLinkedinPostSearchTaskAfterRun(runId: string) {
  const input = await actorRunInput(runId);
  return syncLinkedinPostSearchTask(
    nextHiringPostCompanyBatchIndex(input.authorsCompanies),
    {
      postedLimit: asSearchWindow(input.postedLimit),
      maxPosts: asMaxPosts(input.maxPosts),
    },
  );
}

export async function runLinkedinPostSearch(
  window: SearchWindow,
  maxPosts: number,
  companyBatchIndex = 0,
): Promise<ApifyLinkedinPost[]> {
  const response = await fetch(
    `${apifyApiBase}/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items?timeout=240&clean=true`,
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(250_000),
      headers: {
        ...authorizationHeaders(),
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(buildLinkedinPostSearchInput(window, maxPosts, companyBatchIndex)),
    },
  );
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`Apify Actor run failed with ${response.status}: ${message}`);
  }
  const value = await response.json() as unknown;
  if (!Array.isArray(value)) throw new Error("Apify Actor did not return an array");
  return value as ApifyLinkedinPost[];
}
