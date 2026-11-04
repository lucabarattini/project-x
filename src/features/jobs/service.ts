import { recentWindowMs } from "./board-store";
import { describeFailures, takeBoardFailures } from "./providers/concurrency";
import { resolvePresets } from "./preset-sources";
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
import { fetchLatestShopifyJobs, shopifyBoards } from "./providers/shopify";
import { fetchLatestPcsxJobs, microsoftBoards } from "./providers/microsoft";
import { appleBoards, fetchLatestAppleJobs } from "./providers/apple";
import { fetchLatestMetaJobs, metaBoards } from "./providers/meta";
import {
  customCareerBoards,
  fetchLatestCustomCareerJobs,
} from "./providers/custom-careers";
import {
  buildSearchEntry,
  fromIndexRow,
  rowKey,
  toIndexRow,
  type IndexRow,
  type JobSearchEntry,
} from "./search-model";

export type JobBoard = GreenhouseBoard;

export const jobBoards: JobBoard[] = [
  ...greenhouseBoards,
  ...ashbyBoards,
  ...leverBoards,
  ...workdayBoards,
  ...amazonBoards,
  ...googleBoards,
  ...customCareerBoards,
  ...expediaBoards,
  ...shopifyBoards,
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

/** The file the browser loads: every posting as a compact row. */
export type Board = {
  fetchedAt: string;
  diagnostics: ProviderDiagnostic[];
  rows: IndexRow[];
  /** Each saved search's postings, resolved with the board (see presets.ts). */
  presets: Record<string, IndexRow[]>;
};

/** What the judge reads about a posting; the board itself carries no descriptions. */
export type RecentPosting = {
  key: string;
  title: string;
  company: string;
  location: string;
  postedAt: string;
  text: string;
};

/**
 * Builds run on GitHub's cloud IPs, which the ATS APIs throttle harder than a
 * home connection, and Greenhouse's detail enrichment is the main rate-limit
 * trigger, so it stays capped.
 */
const greenhouseDetailLimit = 60;

type ProviderRun = {
  provider: string;
  /** The board tokens this provider's postings carry, to recognise them in an older snapshot. */
  tokens: string[];
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
    const failures = takeBoardFailures(run.provider);
    if (failures.length > 0) {
      console.warn(`[jobs] ${run.provider}: ${failures.length} board(s) failed${describeFailures(failures)}`);
    }
    return {
      jobs,
      // A board that is gone (404) has nothing to keep; any other failure
      // (timeout, rate limit, block) is the board being unreachable this run.
      failedBoards: failures.filter((failure) => failure.reason !== "404").map((failure) => failure.board),
      diagnostic: {
        provider: run.provider,
        // Providers swallow their own fetch errors and return []. Reporting
        // that as healthy is what let a network outage look like a quiet day.
        status: jobs.length > 0 ? ("ok" as const) : ("empty" as const),
        jobCount: jobs.length,
        durationMs: Date.now() - startedAt,
        message: failures.length > 0
          ? `${failures.length} board(s) failed${describeFailures(failures)}`.slice(0, 600)
          : null,
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === TIMEOUT_SENTINEL;
    return {
      jobs: [],
      failedBoards: [] as string[],
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

function buildProviders(): ProviderRun[] {
  return [
    {
      provider: "greenhouse",
      tokens: greenhouseBoards.map((board) => board.token),
      timeoutMs: 100_000,
      run: () => fetchLatestGreenhouseJobs({ detailLimit: greenhouseDetailLimit }),
    },
    {
      provider: "ashby",
      tokens: ashbyBoards.map((board) => board.token),
      timeoutMs: 75_000,
      run: () => fetchLatestAshbyJobs(),
    },
    {
      provider: "lever",
      tokens: leverBoards.map((board) => board.token),
      timeoutMs: 20_000,
      run: () => fetchLatestLeverJobs(),
    },
    {
      // Seven tenants paged in parallel, Nordstrom's at ~7 s a page. A quiet
      // build already takes ~17 s, so 20 s timed the whole provider out
      // whenever the connection was busy.
      provider: "workday",
      tokens: workdayBoards.map((board) => board.token),
      timeoutMs: 35_000,
      run: () => fetchLatestWorkdayJobs(),
    },
    {
      // One detail fetch per posting over a ~200-entry sitemap, which is the
      // same shape as Meta below rather than the quick list APIs above. At
      // 25s it timed out on every cold snapshot and the whole board was
      // dropped as unavailable.
      provider: "expedia",
      tokens: expediaBoards.map((board) => board.token),
      timeoutMs: 50_000,
      run: () => fetchLatestExpediaJobs(),
    },
    {
      // Same shape as Expedia: one careers page lists every posting, then one
      // page per posting carries the description.
      provider: "shopify",
      tokens: shopifyBoards.map((board) => board.token),
      timeoutMs: 50_000,
      run: () => fetchLatestShopifyJobs(),
    },
    // One run per Eightfold site, so a throttled Microsoft never takes
    // Starbucks down with it.
    ...microsoftBoards.map((board) => ({
      provider: board.company.toLowerCase(),
      tokens: [board.token],
      timeoutMs: 35_000,
      run: () => fetchLatestPcsxJobs(board),
    })),
    {
      provider: "apple",
      tokens: appleBoards.map((board) => board.token),
      timeoutMs: 50_000,
      run: () => fetchLatestAppleJobs(),
    },
    {
      // Meta has no list API: every posting costs one detail fetch for its
      // structured data, so it needs the wider budget the fan-out providers get.
      provider: "meta",
      tokens: metaBoards.map((board) => board.token),
      timeoutMs: 52_000,
      run: () => fetchLatestMetaJobs(),
    },
    {
      provider: "amazon",
      tokens: amazonBoards.map((board) => board.token),
      timeoutMs: 30_000,
      run: () => fetchLatestAmazonJobs({ maxJobs: 600 }),
    },
    {
      provider: "google",
      tokens: googleBoards.map((board) => board.token),
      timeoutMs: 60_000,
      run: () => fetchLatestGoogleJobs({ maxJobs: 400, maxPages: 12 }),
    },
    {
      provider: "custom",
      tokens: customCareerBoards.map((board) => board.token),
      timeoutMs: 15_000,
      run: () => fetchLatestCustomCareerJobs(),
    },
  ];
}

/**
 * The same opening under several requisition ids: Apple posts "CPU
 * Implementation Engineer, Austin" eight times, Amazon a data-center role six.
 * On the board they are one row each, so one company + title + location is
 * one job.
 */
function postingKey(job: { company: string; title: string; location: string }) {
  return `posting:${job.company}|${job.title.trim().toLowerCase()}|${job.location}`;
}

/**
 * Fetches every source and normalizes the result. Runs outside Vercel, in
 * scripts/build-board.mts: this is the work that used up the Hobby CPU limit.
 */
export async function buildBoard(previous: Board | null): Promise<{ board: Board; recent: RecentPosting[] }> {
  const providers = buildProviders();
  const results = await Promise.all(providers.map(runProvider));
  const previousEntries = (previous?.rows ?? []).map((row) => fromIndexRow(row));

  // Apple, Microsoft and Meta refuse datacenter IPs now and then, and a slow
  // board can still miss its budget. Their postings used to vanish from the
  // board until the next build; the previous board's copy is kept instead, and
  // the diagnostic says so. A 404 board is gone and is not kept.
  const carried: JobSearchEntry[] = [];
  results.forEach((result, index) => {
    const providerFailed = result.diagnostic.status === "error" || result.diagnostic.status === "timeout";
    const tokens = new Set(providerFailed ? providers[index].tokens : []);
    const companies = new Set(result.failedBoards);
    const kept = previousEntries.filter(
      (entry) => tokens.has(entry.job.boardToken) || companies.has(entry.job.company),
    );
    if (kept.length === 0) return;
    carried.push(...kept);
    result.diagnostic.message = `${result.diagnostic.message ?? ""} — kept ${kept.length} postings from the previous build`.trim();
  });

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
    });

  const entries = [
    ...jobs.map((job) => buildSearchEntry({ ...job, contentText: compactExperienceEvidence(job.contentText) })),
    ...carried.filter((entry) => {
      const key = postingKey(entry.job);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];

  const previousPresets = previous && Object.fromEntries(
    Object.entries(previous.presets).map(([id, rows]) => [id, rows.map((row) => fromIndexRow(row))]),
  );
  const presets = await resolvePresets(entries, previousPresets ?? undefined);

  const fetchedAt = new Date().toISOString();
  const oldest = Date.parse(fetchedAt) - recentWindowMs;
  return {
    board: {
      fetchedAt,
      diagnostics: results.map((result) => result.diagnostic),
      rows: entries.map(toIndexRow),
      presets: Object.fromEntries(Object.entries(presets).map(([id, list]) => [id, list.map(toIndexRow)])),
    },
    recent: jobs.flatMap((job) => (job.postedAt && Date.parse(job.postedAt) >= oldest
      ? [{
        key: rowKey(job),
        title: job.title,
        company: job.company,
        location: job.location,
        postedAt: job.postedAt,
        text: job.contentText.replace(/\s+/gu, " ").slice(0, 1200),
      }]
      : [])),
  };
}

/**
 * A build most of whose sources failed is an infrastructure artifact, not a
 * quiet day. Providers swallow their own fetch errors and return [], and a
 * starved run makes that happen everywhere at once — the background cache
 * revalidation can be suspended mid-flight, which delays every provider's
 * timeout timer and leaves the whole snapshot near-empty.
 *
 * Publishing one of those would replace the board with a hollowed-out copy, so
 * the build is rejected and the last real board stays up.
 *
 * The bar is deliberately low: half the sources failing outright is already far
 * outside normal, where one or two empty boards are routine.
 */
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
