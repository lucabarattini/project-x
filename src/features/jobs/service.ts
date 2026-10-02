import { unstable_cache } from "next/cache";
import { after } from "next/server";
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

/**
 * Hard ceiling on how stale a persisted snapshot may be before it is refused.
 *
 * unstable_cache is stale-while-revalidate: once past `revalidate` it keeps
 * serving the old value and rebuilds in the background. If the process exits
 * before that rebuild lands — routine in dev — the same stale entry is served
 * again on the next boot, so a snapshot can outlive its TTL indefinitely. The
 * visible symptom is a day-old snapshot rendering as "no roles published
 * today". Past this ceiling we block on a rebuild instead of serving stale.
 */
const snapshotMaxStaleMs = 30 * 60 * 1000;

function isStaleBeyondLimit(fetchedAt: string) {
  const age = Date.now() - Date.parse(fetchedAt);
  return Number.isNaN(age) || age > snapshotMaxStaleMs;
}

/**
 * Chunk size for the durable snapshot cache. Next.js refuses to persist
 * unstable_cache entries larger than 2 MB; the full snapshot (11k+ entries)
 * is ~14 MB, so we split it into small chunks that each fit comfortably.
 */
const snapshotChunkSize = 600;

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

type ChunkValue = {
  items: JobSearchEntry[];
  fetchedAt: string;
  jobCount: number;
  diagnostics: ProviderDiagnostic[];
};

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
    // Armed here rather than in rebuildSnapshot because a chunk read builds
    // too: without this a cold instance ran the whole fan-out twice in a row
    // before it would admit the sources were refusing it.
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
 * from the persisted chunks — a cold instance that has never built anything
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

/**
 * The last builds this instance made, by fetchedAt. A chunk is only ever cut
 * from the snapshot its key names: cutting it from whatever build happened to
 * be running mixed two fetches, which showed up as duplicated rows.
 */
const builtSnapshots = new Map<string, JobSnapshot>();

function ensureSnapshotBuild(): Promise<JobSnapshot> {
  if (!snapshotBuild) {
    snapshotBuild = buildVerifiedSnapshot()
      .then((snapshot) => {
        builtSnapshots.set(snapshot.fetchedAt, snapshot);
        for (const fetchedAt of builtSnapshots.keys()) {
          if (builtSnapshots.size <= 2) break;
          builtSnapshots.delete(fetchedAt);
        }
        return snapshot;
      })
      .finally(() => {
        snapshotBuild = null;
      });
  }
  return snapshotBuild;
}

function chunkOf(snapshot: JobSnapshot, index: number): ChunkValue {
  const start = index * snapshotChunkSize;
  return {
    items: snapshot.entries.slice(start, start + snapshotChunkSize),
    fetchedAt: snapshot.fetchedAt,
    jobCount: snapshot.entries.length,
    diagnostics: snapshot.diagnostics,
  };
}

function writeLaterChunks(snapshot: JobSnapshot) {
  const chunkCount = Math.ceil(snapshot.entries.length / snapshotChunkSize);
  return Promise.all(
    Array.from({ length: chunkCount - 1 }, (_, index) =>
      getSnapshotChunk(`${index + 1}:${snapshot.fetchedAt}`),
    ),
  );
}

/**
 * One slice of the snapshot in the Next.js data cache. Chunk 0 has a fixed
 * key and points at the current snapshot; every later chunk is keyed by that
 * snapshot's fetchedAt.
 *
 * Chunk 0 used to be refreshed on its own: its background revalidation built
 * a new snapshot but stored only slice 0, so the next reader found no chunks
 * for the fetchedAt it named and rebuilt the whole board inline (~70 s on a
 * fresh Vercel instance). Now the rest of a snapshot is written before chunk
 * 0 points at it, and a later chunk never starts a build of its own.
 */
const getSnapshotChunk = unstable_cache(
  async (key: string): Promise<ChunkValue> => {
    const separator = key.indexOf(":");
    if (separator < 0) {
      const newest = [...builtSnapshots.values()].at(-1);
      const snapshot = newest && Date.now() - Date.parse(newest.fetchedAt) < snapshotTtlMs
        ? newest
        : await ensureSnapshotBuild();
      await writeLaterChunks(snapshot);
      return chunkOf(snapshot, 0);
    }
    const snapshot = builtSnapshots.get(key.slice(separator + 1));
    if (!snapshot) {
      throw new Error(`Snapshot chunk ${key} is not on this instance`);
    }
    return chunkOf(snapshot, Number(key.slice(0, separator)));
  },
  ["job-snapshot-chunk-v15"],
  { revalidate: snapshotRevalidateSeconds },
);

let moduleSnapshot: JobSnapshot | null = null;

/**
 * Builds a fresh snapshot and writes its later chunks; chunk 0 moves to it on
 * its next revalidation, which reuses this build instead of starting another.
 */
async function buildAndCache(): Promise<JobSnapshot> {
  const snapshot = await ensureSnapshotBuild();
  try {
    await writeLaterChunks(snapshot);
  } catch {
    // Cache warming is best-effort; the module snapshot is still served.
  }
  return snapshot;
}

/** Reassembles the persisted snapshot from its chunks, or null if there is none. */
async function readCachedSnapshot(): Promise<JobSnapshot | null> {
  try {
    const first = await getSnapshotChunk("0");
    const chunkCount = Math.ceil(first.jobCount / snapshotChunkSize);
    const rest = chunkCount > 1
      ? await Promise.all(
          Array.from({ length: chunkCount - 1 }, (_, index) =>
            getSnapshotChunk(`${index + 1}:${first.fetchedAt}`),
          ),
        )
      : [];
    lastGoodEntryCount = Math.max(lastGoodEntryCount, first.jobCount);
    // A chunk missing from the cache is rebuilt from a fresh fetch, whose rows
    // sit at different offsets than chunk 0's: without this the seam showed
    // the same posting twice in a row.
    const seen = new Set<string>();
    const entries = [...first.items, ...rest.flatMap((chunk) => chunk.items)].filter((entry) => {
      const key = postingKey(entry.job);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      entries,
      fetchedAt: first.fetchedAt,
      diagnostics: first.diagnostics,
    };
  } catch {
    return null;
  }
}

export async function getSnapshot(): Promise<JobSnapshot> {
  if (moduleSnapshot && Date.now() - Date.parse(moduleSnapshot.fetchedAt) < snapshotTtlMs) {
    return moduleSnapshot;
  }

  const cached = await readCachedSnapshot();

  // Stale-while-revalidate may hand back an entry far older than the TTL, and
  // a personal site is idle for most of the day — so this branch, not the
  // background refresh, is what most visits actually take. It used to discard
  // `cached` before rebuilding, which is how a refused rebuild could put a
  // two-role board on screen while a complete one sat in hand. The rebuild now
  // carries that snapshot as its fallback, and backs off after one failure
  // instead of making every visitor wait out the same doomed fan-out.
  const stale = !cached || isStaleBeyondLimit(cached.fetchedAt);
  const retryable = Date.now() - unusableRebuildAt >= rebuildRetryCooldownMs;
  if (stale && retryable) {
    if (!cached) {
      return rebuildSnapshot(null);
    }
    // Blocking here made the first visit of every idle stretch wait out the
    // whole ~45 s fan-out. The stale board is served at once and rebuilt
    // after the response, so the visit after that one is fresh.
    refreshAfterResponse(cached);
    moduleSnapshot = cached;
    return cached;
  }

  if (cached) {
    moduleSnapshot = cached;
    return cached;
  }
  // Nothing persisted and still inside the backoff: this instance's own copy
  // is the last real board there is.
  if (moduleSnapshot) {
    return moduleSnapshot;
  }
  return rebuildSnapshot(null);
}

function refreshAfterResponse(fallback: JobSnapshot) {
  const refresh = () => rebuildSnapshot(fallback).then(() => undefined, () => undefined);
  try {
    after(refresh);
  } catch {
    // Outside a request (the startup warm-up) there is no response to wait for.
    void refresh();
  }
}

/**
 * Rebuilds and promotes the result to the module fast path. When the rebuild is
 * unusable the last real snapshot is served instead, however old it is: the
 * openings in it were real, and a board that has lost most of its sources is
 * not more honest for being fresh. Nothing is written to the module copy or the
 * chunk cache, so a later request can still pick up a healthy build.
 *
 * The fresh diagnostics ride along on the fallback, so the dashboard reports
 * which sources are down right now rather than how they looked when the
 * snapshot it is showing was built.
 */
async function rebuildSnapshot(fallback: JobSnapshot | null): Promise<JobSnapshot> {
  try {
    const snapshot = await buildAndCache();
    moduleSnapshot = snapshot;
    unusableRebuildAt = 0;
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
