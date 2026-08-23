import { unstable_cache } from "next/cache";
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
import { fetchLatestMicrosoftJobs, microsoftBoards } from "./providers/microsoft";
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
  status: "ok" | "error" | "timeout";
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
        status: "ok" as const,
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
      provider: "expedia",
      timeoutMs: 25_000,
      run: () => fetchLatestExpediaJobs(),
    },
    {
      provider: "microsoft",
      timeoutMs: 25_000,
      run: () => fetchLatestMicrosoftJobs(),
    },
    {
      provider: "apple",
      timeoutMs: 20_000,
      run: () => fetchLatestAppleJobs(),
    },
    {
      // Meta has no list API: every posting costs one detail fetch for its
      // structured data, so it needs the wider budget the fan-out providers get.
      provider: "meta",
      timeoutMs: 30_000,
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
async function buildSnapshotInternal(): Promise<JobSnapshot> {
  const results = await Promise.all(buildProviders({}).map(runProvider));

  const seen = new Set<string>();
  const jobs = results
    .flatMap((result) => result.jobs)
    .filter((job) => {
      const key = `${job.boardToken}:${job.id}`;
      const fallbackKey = `url:${job.absoluteUrl}`;
      if (seen.has(key) || seen.has(fallbackKey)) return false;
      seen.add(key);
      seen.add(fallbackKey);
      return true;
    })
    .sort((a, b) => {
      const left = a.postedAt ? Date.parse(a.postedAt) : 0;
      const right = b.postedAt ? Date.parse(b.postedAt) : 0;
      return right - left;
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

let snapshotBuild: Promise<JobSnapshot> | null = null;

function ensureSnapshotBuild(): Promise<JobSnapshot> {
  if (!snapshotBuild) {
    snapshotBuild = buildSnapshotInternal().finally(() => {
      snapshotBuild = null;
    });
  }
  return snapshotBuild;
}

/**
 * One slice of the snapshot, persisted in the Next.js data cache for 300 s.
 * Chunk 0 has a fixed key and carries the snapshot metadata; every later
 * chunk is keyed by the snapshot's fetchedAt so a rebuild never mixes data
 * from two different fetches.
 */
const getSnapshotChunk = unstable_cache(
  // The key is "index" for chunk 0 and "index:fetchedAt" for every later
  // chunk, so a rebuild never mixes chunks from two different fetches.
  async (key: string): Promise<ChunkValue> => {
    const snapshot = await ensureSnapshotBuild();
    const separator = key.indexOf(":");
    const index = separator >= 0 ? Number(key.slice(0, separator)) : Number(key);
    const start = index * snapshotChunkSize;
    return {
      items: snapshot.entries.slice(start, start + snapshotChunkSize),
      fetchedAt: snapshot.fetchedAt,
      jobCount: snapshot.entries.length,
      diagnostics: snapshot.diagnostics,
    };
  },
  ["job-snapshot-chunk-v13"],
  { revalidate: snapshotRevalidateSeconds },
);

let moduleSnapshot: JobSnapshot | null = null;

/**
 * Builds a fresh snapshot, then writes it into the persisted chunk cache.
 * Concurrent callers share the same in-flight build.
 */
async function buildAndCache(): Promise<JobSnapshot> {
  if (!snapshotBuild) {
    snapshotBuild = (async () => {
      const snapshot = await buildSnapshotInternal();
      try {
        const chunkCount = Math.ceil(snapshot.entries.length / snapshotChunkSize);
        await Promise.all([
          getSnapshotChunk("0"),
          ...Array.from({ length: chunkCount - 1 }, (_, index) =>
            getSnapshotChunk(`${index + 1}:${snapshot.fetchedAt}`),
          ),
        ]);
      } catch {
        // Cache warming is best-effort; the module snapshot is still served.
      }
      return snapshot;
    })().finally(() => {
      snapshotBuild = null;
    });
  }
  return snapshotBuild;
}

/**
 * Correct caching model: the module copy is only a fast path. Once it is
 * older than the TTL it is discarded and the persisted (cross-bundle) chunks
 * are re-read; if those are also expired, the rebuild blocks that one request
 * — exactly "expiration is refreshed by the first subsequent request".
 */
export async function getSnapshot(): Promise<JobSnapshot> {
  if (moduleSnapshot && Date.now() - Date.parse(moduleSnapshot.fetchedAt) < snapshotTtlMs) {
    return moduleSnapshot;
  }

  try {
    const first = await getSnapshotChunk("0");

    // Stale-while-revalidate may hand back an entry far older than the TTL.
    // Rebuild synchronously rather than render a stale day against a
    // "today" filter that will then legitimately match nothing.
    if (isStaleBeyondLimit(first.fetchedAt)) {
      const rebuilt = await buildAndCache();
      moduleSnapshot = rebuilt;
      return rebuilt;
    }

    const chunkCount = Math.ceil(first.jobCount / snapshotChunkSize);
    const rest = chunkCount > 1
      ? await Promise.all(
          Array.from({ length: chunkCount - 1 }, (_, index) =>
            getSnapshotChunk(`${index + 1}:${first.fetchedAt}`),
          ),
        )
      : [];
    const snapshot: JobSnapshot = {
      entries: [...first.items, ...rest.flatMap((chunk) => chunk.items)],
      fetchedAt: first.fetchedAt,
      diagnostics: first.diagnostics,
    };
    moduleSnapshot = snapshot;
    return snapshot;
  } catch {
    const snapshot = await buildAndCache();
    moduleSnapshot = snapshot;
    return snapshot;
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
