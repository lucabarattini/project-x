import { emptyHiringPostFeed } from "./feed";
import type { HiringPostFeed } from "./types";

/**
 * The Apify REST primitives, deliberately free of "server-only".
 *
 * apify.ts is server-only, which is right for the request path but makes it
 * unimportable from a plain script: Next aliases the "server-only" package at
 * build time and it is not installed as a dependency. The one-off search
 * script needs the same feed read/write the app uses, and duplicating the
 * record validation in a script is how two readers of one record drift apart.
 */
export const apifyApiBase = "https://api.apify.com/v2";

const feedRecordKey = "HIRING_POSTS_FEED";

export function requiredEnvironment(name: "APIFY_TOKEN" | "APIFY_STORE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function authorizationHeaders() {
  return {
    authorization: `Bearer ${requiredEnvironment("APIFY_TOKEN")}`,
  };
}

export function apifyId(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]{6,80}$/u.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export async function readHiringPostFeed(): Promise<HiringPostFeed> {
  const storeId = encodeURIComponent(requiredEnvironment("APIFY_STORE_ID"));
  const response = await fetch(
    `${apifyApiBase}/key-value-stores/${storeId}/records/${feedRecordKey}`,
    { cache: "no-store", headers: authorizationHeaders() },
  );

  if (response.status === 404) return emptyHiringPostFeed();
  if (!response.ok) throw new Error(`Apify feed read failed with ${response.status}`);

  const value = await response.json() as Partial<HiringPostFeed>;
  if (value.version !== 1 || !Array.isArray(value.posts)) {
    throw new Error("Apify feed record has an unsupported shape");
  }
  return value as HiringPostFeed;
}

export async function writeHiringPostFeed(feed: HiringPostFeed) {
  const storeId = encodeURIComponent(requiredEnvironment("APIFY_STORE_ID"));
  const response = await fetch(
    `${apifyApiBase}/key-value-stores/${storeId}/records/${feedRecordKey}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        ...authorizationHeaders(),
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(feed),
    },
  );
  if (!response.ok) throw new Error(`Apify feed write failed with ${response.status}`);
}

/**
 * Runs the post-search Actor directly and waits for its dataset.
 *
 * Deliberately not the Task: the Task carries the scheduled rotation's input,
 * and running it would both overwrite that input and advance the batch. An
 * Actor run with an inline input leaves the schedule untouched.
 */
export async function runPostSearchActor(input: unknown): Promise<unknown[]> {
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
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Apify Actor run failed with ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
  const value = await response.json() as unknown;
  if (!Array.isArray(value)) throw new Error("Apify Actor did not return an array");
  return value;
}
