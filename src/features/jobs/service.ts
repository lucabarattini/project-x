import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { gunzipSync, gzipSync } from "node:zlib";
import { get, put } from "@vercel/blob";
import { findPreset, resolvePreset } from "./presets";
import { compactExperienceEvidence } from "./display";
import { amazonBoards, fetchLatestAmazonJobs } from "./providers/amazon";
import { ashbyBoards, fetchLatestAshbyJobs } from "./providers/ashby";
import { fetchLatestGoogleJobs, googleBoards } from "./providers/google";
import {
  fetchLatestGreenhouseJobs,
  greenhouseBoards,
  type GreenhouseBoard,
  type GreenhouseJob,
} from "./providers/greenhouse";
import { fetchLatestLeverJobs, leverBoards } from "./providers/lever";
import { fetchLatestWorkdayJobs, workdayBoards } from "./providers/workday";
import { expediaBoards, fetchLatestExpediaJobs } from "./providers/expedia";
import { fetchLatestPcsxJobs, microsoftBoards } from "./providers/microsoft";
import { appleBoards, fetchLatestAppleJobs } from "./providers/apple";
import { fetchLatestMetaJobs, metaBoards } from "./providers/meta";
import {
  customCareerBoards,
  fetchLatestCustomCareerJobs,
} from "./providers/custom-careers";
import {
  buildSearchEntry,
  mergeSearchEntries,
  type JobSearchEntry,
  type SearchJob,
} from "./search-model";

export type JobBoard = GreenhouseBoard;
export type Job = SearchJob;

export interface JobProvider {
  id: string;
  fetchJobs(board: BoardConfig): Promise<Job[]>;
}

export type BoardConfig = {
  company: string;
  provider: string;
  careersUrl: string;
  endpointOrSlug: string;
  evidenceUrl: string;
  verifiedAt: string;
  status: "live" | "discovered" | "blocked";
};

export const jobBoards: JobBoard[] = [
  ...greenhouseBoards,
  ...ashbyBoards,
  ...leverBoards,
  ...workdayBoards,
  ...amazonBoards,
  ...googleBoards,
  ...customCareerBoards,
  ...expediaBoards,
  ...microsoftBoards,
  ...appleBoards,
  ...metaBoards,
];

export type ProviderDiagnostic = {
  provider: string;
  status: "ok" | "empty" | "error" | "timeout";
  jobCount: number;
  durationMs: number;
  message: string | null;
};

export type JobSnapshot = {
  entries: JobSearchEntry[];
  fetchedAt: string;
  diagnostics: ProviderDiagnostic[];
};

type FetchJobsOptions = {
  amazonLimit?: number;
  googleLimit?: number;
  googlePages?: number;
  greenhouseDetailLimit?: number;
};

/**
 * Serverless (Vercel) builds run on cloud IPs that the ATS APIs throttle
 * harder than home/office IPs, inside a function with a short wall-clock
 * limit. The snapshot rebuilds less often there (fewer request bursts) and
 * the Greenhouse detail enrichment is cut in half (its 41-board + 120-detail
 * fan-out is the main rate-limit trigger).
 */
const isServerless = process.env.VERCEL === "1";
const snapshotRevalidateSeconds = isServerless ? 600 : 300;
const greenhouseDetailLimit = isServerless ? 60 : 120;

const snapshotTtlMs = snapshotRevalidateSeconds * 1000;

type ProviderRun = {
  provider: string;
  timeoutMs: number;
  run: () => Promise<GreenhouseJob[]>;
};

const TIMEOUT_SENTINEL = "provider-timeout";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(TIMEOUT_SENTINEL)), timeoutMs);
    }),
  ]);
}

async function runProvider(run: ProviderRun) {
  const startedAt = Date.now();
  try {
    const jobs = await withTimeout(run.run(), run.timeoutMs);
    return {
      jobs,
      diagnostic: {
        provider: run.provider,
        // Providers swallow their own fetch errors and return []. Reporting
        // that as healthy is what let a network outage look like a quiet day.
        status: jobs.length > 0 ? ("ok" as const) : ("empty" as const),
        jobCount: jobs.length,
        durationMs: Date.now() - startedAt,
        message: null,
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === TIMEOUT_SENTINEL;
    return {
      jobs: [],
      diagnostic: {
        provider: run.provider,
        status: timedOut ? ("timeout" as const) : ("error" as const),
        jobCount: 0,
        durationMs: Date.now() - startedAt,
        message: timedOut
          ? `Timed out after ${run.timeoutMs / 1000}s`
          : error instanceof Error
            ? error.message.slice(0, 240)
            : "Unknown provider error",
      },
    };
  }
}

function buildProviders(options: FetchJobsOptions): ProviderRun[] {
  return [
    {
      provider: "greenhouse",
      timeoutMs: 30_000,
      run: () => fetchLatestGreenhouseJobs({ detailLimit: options.greenhouseDetailLimit ?? greenhouseDetailLimit }),
    },
    {
      provider: "ashby",
      timeoutMs: 25_000,
      run: () => fetchLatestAshbyJobs(),
    },
    {
      provider: "lever",
      timeoutMs: 20_000,
      run: () => fetchLatestLeverJobs(),
    },
    {
      provider: "workday",
      timeoutMs: 20_000,
      run: () => fetchLatestWorkdayJobs(),
    },
    {
      // One detail fetch per posting over a ~200-entry sitemap, which is the
      // same shape as Meta below rather than the quick list APIs above. At
      // 25s it timed out on every cold snapshot and the whole board was
      // dropped as unavailable.
      provider: "expedia",
      timeoutMs: 50_000,
      run: () => fetchLatestExpediaJobs(),
    },
    // One run per Eightfold site, so a throttled Microsoft never takes
    // Starbucks down with it.
    ...microsoftBoards.map((board) => ({
      provider: board.company.toLowerCase(),
      timeoutMs: 35_000,
      run: () => fetchLatestPcsxJobs(board),
    })),
    {
      provider: "apple",
      timeoutMs: 50_000,
      run: () => fetchLatestAppleJobs(),
    },
    {
      // Meta has no list API: every posting costs one detail fetch for its
      // structured data, so it needs the wider budget the fan-out providers get.
      provider: "meta",
      timeoutMs: 52_000,
      run: () => fetchLatestMetaJobs(),
    },
    {
      provider: "amazon",
      timeoutMs: 30_000,
      run: () => fetchLatestAmazonJobs({ maxJobs: options.amazonLimit ?? 600 }),
    },
    {
      provider: "google",
      timeoutMs: 30_000,
      run: () => fetchLatestGoogleJobs({
        maxJobs: options.googleLimit ?? 400,
        maxPages: options.googlePages ?? 12,
      }),
    },
    {
      provider: "custom",
      timeoutMs: 15_000,
      run: () => fetchLatestCustomCareerJobs(),
    },
  ];
}

/**
 * Fetches and normalizes the full snapshot. Expensive (all providers), so it
 * runs at most once per process and is persisted as small chunks below.
 */
/**
 * The same opening under several requisition ids: Apple posts "CPU
 * Implementation Engineer, Austin" eight times, Amazon a data-center role six.
 * On the board they are one row each, so one company + title + location is
 * one job.
 */
function postingKey(job: { company: string; title: string; location: string }) {
  return `posting:${job.company}|${job.title.trim().toLowerCase()}|${job.location}`;
}

async function buildSnapshotInternal(): Promise<JobSnapshot> {
  const results = await Promise.all(buildProviders({}).map(runProvider));

  const seen = new Set<string>();
  const jobs = results
    .flatMap((result) => result.jobs)
    .sort((a, b) => {
      const left = a.postedAt ? Date.parse(a.postedAt) : 0;
      const right = b.postedAt ? Date.parse(b.postedAt) : 0;
      return right - left;
    })
    // Newest first, so the copy kept is the latest one.
    .filter((job) => {
      const keys = [`${job.boardToken}:${job.id}`, `url:${job.absoluteUrl}`, postingKey(job)];
      if (keys.some((key) => seen.has(key))) return false;
      for (const key of keys) seen.add(key);
      return true;
    })
    .map((job) => ({
      ...job,
      contentText: compactExperienceEvidence(job.contentText),
    }));

  return {
    entries: jobs.map(buildSearchEntry),
    fetchedAt: new Date().toISOString(),
    diagnostics: results.map((result) => result.diagnostic),
  };
}

/**
 * A build most of whose sources failed is an infrastructure artifact, not a
 * quiet day. Providers swallow their own fetch errors and return [], and a
 * starved run makes that happen everywhere at once — the background cache
 * revalidation can be suspended mid-flight, which delays every provider's
 * timeout timer and leaves the whole snapshot near-empty.
 *
 * Persisting one of those serves a hollowed-out board for a full TTL and
 * re-poisons the cache on each rebuild attempted while the condition lasts, so
 * the build is rejected and the caller keeps serving the last real snapshot.
 * The diagnostics ride along so the UI can still say which sources failed.
 *
 * The bar is deliberately low: half the sources failing outright is already far
 * outside normal, where one or two empty boards are routine.
 */
class UnusableSnapshotError extends Error {
  constructor(readonly snapshot: JobSnapshot, reason: string) {
    super(`JOB_SNAPSHOT_UNUSABLE: ${reason}`);
    this.name = "UnusableSnapshotError";
  }
}

export function snapshotRejectionReason(
  entryCount: number,
  diagnostics: ProviderDiagnostic[],
  previousEntryCount = 0,
): string | null {
  if (entryCount === 0) {
    return "every source came back empty";
  }
  const failed = diagnostics.filter((diagnostic) => (
    diagnostic.status === "error" || diagnostic.status === "timeout"
  )).length;
  if (diagnostics.length > 0 && failed * 2 >= diagnostics.length) {
    return `${failed} of ${diagnostics.length} sources failed`;
  }
  // Counting failed sources is a proxy, and it kept letting real damage
  // through: a build where five of eleven sources were refused sits just under
  // the bar, so it was cached and served as a board of two roles. The size of
  // the result is the fact that actually matters — no ten-minute window
  // legitimately removes half the openings — and it holds however the sources
  // chose to report themselves.
  if (previousEntryCount > 0 && entryCount * 2 < previousEntryCount) {
    return `${entryCount} entries against ${previousEntryCount} in the last good build`;
  }
  return null;
}

async function buildVerifiedSnapshot(): Promise<JobSnapshot> {
  const snapshot = await buildSnapshotInternal();
  const reason = snapshotRejectionReason(
    snapshot.entries.length,
    snapshot.diagnostics,
    lastGoodEntryCount,
  );
  if (reason) {
    unusableRebuildAt = Date.now();
    throw new UnusableSnapshotError(snapshot, reason);
  }
  lastGoodEntryCount = snapshot.entries.length;
  unusableRebuildAt = 0;
  return snapshot;
}

/**
 * Entry count of the last snapshot known to be real. The guard above compares
 * a fresh build against it, so it is refreshed both from a successful build and
 * from the stored snapshot — a cold instance that has never built anything
 * still knows how big the board is supposed to be.
 */
let lastGoodEntryCount = 0;

/**
 * When a rebuild comes back unusable, stop attempting another one on every
 * request. The sources that refused us keep refusing for a while, each attempt
 * costs a full eleven-provider fan-out, and the visitor waits through all of it
 * only to be served the fallback anyway.
 */
let unusableRebuildAt = 0;
const rebuildRetryCooldownMs = 2 * 60 * 1000;

let snapshotBuild: Promise<JobSnapshot> | null = null;

function ensureSnapshotBuild(): Promise<JobSnapshot> {
  if (!snapshotBuild) {
    snapshotBuild = buildVerifiedSnapshot().finally(() => {
      snapshotBuild = null;
    });
  }
  return snapshotBuild;
}

/**
 * The last good snapshot, kept in Vercel Blob so it outlives both instances
 * and deployments. The Next.js data cache did neither on Vercel: every deploy
 * started empty, and its first visitors waited out a ~45 s rebuild each. One
 * gzipped object overwritten in place, so the store only ever holds one
 * snapshot (a few MB of the 1 GB plan) however often it is written.
 */
const snapshotBlobPath = "snapshot/latest.json.gz";
let snapshotBlobEtag: string | undefined;

/** The stored snapshot, or null when there is none, it is the copy this instance already holds, or no store is configured (local dev). */
async function readStoredSnapshot(): Promise<JobSnapshot | null> {
  try {
    const result = await get(snapshotBlobPath, {
      access: "private",
      useCache: false,
      ifNoneMatch: snapshotBlobEtag,
    });
    if (result?.statusCode !== 200) return null;
    snapshotBlobEtag = result.blob.etag;
    const gzipped = Buffer.from(await new Response(result.stream).arrayBuffer());
    const snapshot = JSON.parse(gunzipSync(gzipped).toString("utf8")) as JobSnapshot;
    lastGoodEntryCount = Math.max(lastGoodEntryCount, snapshot.entries.length);
    return snapshot;
  } catch {
    return null;
  }
}

async function storeSnapshot(snapshot: JobSnapshot) {
  try {
    const result = await put(snapshotBlobPath, gzipSync(JSON.stringify(snapshot)), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/gzip",
    });
    snapshotBlobEtag = result.etag;
  } catch {
    // Persisting is best-effort; this instance still serves the new board.
  }
}

let moduleSnapshot: JobSnapshot | null = null;

function isFresh(snapshot: JobSnapshot) {
  return Date.now() - Date.parse(snapshot.fetchedAt) < snapshotTtlMs;
}

/**
 * Never makes a visitor wait for the providers while any real board exists:
 * a cold instance reads the stored snapshot (~1 s), and a stale one is served
 * as-is while it refreshes after the response. Only a store that has never
 * been written blocks on a build.
 */
export async function getSnapshot(): Promise<JobSnapshot> {
  if (moduleSnapshot && isFresh(moduleSnapshot)) {
    return moduleSnapshot;
  }
  moduleSnapshot ??= await readStoredSnapshot();
  if (!moduleSnapshot) {
    return rebuildSnapshot(null);
  }
  if (Date.now() - unusableRebuildAt >= rebuildRetryCooldownMs) {
    refreshAfterResponse();
  }
  return moduleSnapshot;
}

let snapshotRefresh: Promise<void> | null = null;

function refreshAfterResponse() {
  snapshotRefresh ??= refreshSnapshot()
    .catch(() => undefined)
    .finally(() => {
      snapshotRefresh = null;
    });
  const pending = snapshotRefresh;
  try {
    after(() => pending);
  } catch {
    // Outside a request (the startup warm-up) there is no response to wait for.
  }
}

/** Another instance may have rebuilt already: adopt its snapshot when fresh, fan out to the providers only when not. */
async function refreshSnapshot() {
  const stored = await readStoredSnapshot();
  if (stored && isFresh(stored)) {
    moduleSnapshot = stored;
    return;
  }
  await rebuildSnapshot(moduleSnapshot);
}

/**
 * Rebuilds, promotes the result to the module copy and stores it. When the
 * rebuild is unusable the last real snapshot is served instead, however old it
 * is: the openings in it were real, and a board that has lost most of its
 * sources is not more honest for being fresh. Nothing is stored, so a later
 * request can still pick up a healthy build.
 *
 * The fresh diagnostics ride along on the fallback, so the dashboard reports
 * which sources are down right now rather than how they looked when the
 * snapshot it is showing was built.
 */
async function rebuildSnapshot(fallback: JobSnapshot | null): Promise<JobSnapshot> {
  try {
    const snapshot = await ensureSnapshotBuild();
    moduleSnapshot = snapshot;
    unusableRebuildAt = 0;
    await storeSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    if (!(error instanceof UnusableSnapshotError)) {
      throw error;
    }
    unusableRebuildAt = Date.now();
    const previous = fallback ?? moduleSnapshot;
    if (previous) {
      return { ...previous, diagnostics: error.snapshot.diagnostics };
    }
    // Nothing real has ever been built on this instance: report the failure
    // honestly rather than rendering an empty board as if it were a result.
    return error.snapshot;
  }
}

export async function fetchLatestJobs(): Promise<Job[]> {
  const snapshot = await getSnapshot();
  return snapshot.entries.map((entry) => entry.job);
}

/**
 * Live Amazon ATS keyword results, normalized into search entries and cached
 * for the same 300 s as the snapshot. Amazon's public search endpoint holds
 * 10k+ U.S. jobs, so the recency-window snapshot alone can never cover
 * role-specific searches (e.g. "financial analyst" in Seattle); querying the
 * same `base_query` the careers site uses closes that gap.
 */
const getAmazonLiveEntries = unstable_cache(
  async (query: string): Promise<JobSearchEntry[]> => {
    try {
      const jobs = await fetchLatestAmazonJobs({ query, maxJobs: 150 });
      return jobs.map(buildSearchEntry);
    } catch {
      // Live search is best-effort; fall back to the snapshot-only feed.
      return [];
    }
  },
  ["amazon-live-query-v1"],
  { revalidate: snapshotRevalidateSeconds },
);

/**
 * Search pool for one request: the cached snapshot plus, when a keyword is
 * present, live Amazon ATS hits for that keyword. Location/date/experience/
 * portal filtering still happens in searchJobs, so a "financial analyst" +
 * Seattle search now sees the same roles Amazon's own ATS shows.
 */
/**
 * The entries a search runs over: a preset's postings as its own site lists
 * them, otherwise the snapshot plus live Amazon hits for a keyword. If the
 * site cannot be read the preset shows nothing rather than guessing.
 */
export async function getSearchEntries(
  snapshot: JobSnapshot,
  params: { q: string; preset: string | null },
): Promise<JobSearchEntry[]> {
  const preset = findPreset(params.preset);
  if (!preset) {
    return getAugmentedEntries(snapshot, params.q);
  }
  const ids = await resolvePreset(preset).catch(() => new Set<string>());
  return snapshot.entries.filter(
    (entry) => entry.job.company === preset.company && ids.has(String(entry.job.id)),
  );
}

export async function getAugmentedEntries(
  snapshot: JobSnapshot,
  query: string,
): Promise<JobSearchEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return snapshot.entries;
  }

  const live = await getAmazonLiveEntries(trimmed);
  return mergeSearchEntries(snapshot.entries, live);
}
