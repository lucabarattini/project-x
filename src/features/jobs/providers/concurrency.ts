/**
 * Fans out over `items` with a bounded worker pool and stops handing out new
 * work once the run deadline passes. Providers that page a large board share
 * this: `runProvider` discards every job when its timeout fires, so returning
 * partial results beats returning none.
 */
export async function mapWithinDeadline<T, R>(
  items: T[],
  limit: number,
  startedAt: number,
  deadlineMs: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (Date.now() - startedAt > deadlineMs) {
        return;
      }
      results.push(await mapper(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Page fan-out is only safe once the board has told us how many rows exist,
 * so every paging provider reads page one first and derives the rest from the
 * reported total. Serverless runs stay on a smaller pool: datacenter IPs draw
 * rate limiting sooner than a laptop does.
 */
export const pageConcurrency = process.env.VERCEL === "1" ? 8 : 12;

/**
 * Pool for boards that need one request per posting rather than one per page
 * of postings. The work is the same wall-clock budget spread over ~20x more
 * requests, so the pool is wider — but still narrower in serverless.
 */
export const detailConcurrency = process.env.VERCEL === "1" ? 16 : 24;

/**
 * Collapses per-board results into one list, refusing to pass off a total
 * outage as an empty board.
 *
 * Every multi-board provider catches per board, so one dead board cannot take
 * down the other forty — that part is deliberate. The cost was that when
 * *every* board failed the provider still returned [], which runProvider reads
 * as "answered, had nothing to list". A source that was entirely blocked was
 * therefore counted as healthy, the dashboard called it "no openings", and the
 * snapshot guard downstream never saw it fail — which is how a build that lost
 * most of the board still passed for a real one.
 *
 * Boards that failed pass `null`; boards that genuinely have no openings pass
 * an empty array, and those two are no longer the same thing.
 */
export function collectBoardResults<T>(
  provider: string,
  results: Array<T[] | BoardFailure | null>,
): T[] {
  const failures = results.filter((result): result is BoardFailure => result instanceof BoardFailure);
  boardFailures.set(provider, failures);
  const failed = results.filter((result) => !Array.isArray(result)).length;
  if (failed > 0 && failed === results.length) {
    throw new Error(`${provider}: all ${failed} board(s) failed${describeFailures(failures)}`);
  }
  return results.filter((result): result is T[] => Array.isArray(result)).flat();
}

/**
 * A board that could not be read, and why. Providers used to return a bare
 * null, so a source that lost half its boards on Vercel reported "ok" with
 * nothing to say which boards or what refused them.
 */
export class BoardFailure {
  constructor(readonly board: string, readonly reason: string) {}
}

export function boardFailure(board: string, error: unknown) {
  const reason = error instanceof Error
    ? error.name === "TimeoutError" || error.name === "AbortError"
      ? "timeout"
      : error.message.match(/returned (\d{3})/u)?.[1] ?? error.message.slice(0, 60)
    : String(error).slice(0, 60);
  return new BoardFailure(board, reason);
}

const boardFailures = new Map<string, BoardFailure[]>();

/**
 * Reads every board, then reads the ones that timed out once more, four at a
 * time and with twice the time. On Vercel the snapshot runs every provider in
 * one function at once, so the largest boards (Applied Intuition, Anthropic's
 * 9 MB list) were the ones to time out — 20 of 115 Ashby boards and 6
 * Greenhouse ones on a single build, more than half of Ashby's postings.
 * By the second pass most of the field has finished.
 */
export async function readBoards<B extends { company: string }, T>(
  boards: B[],
  concurrency: number,
  timeoutMs: number,
  read: (board: B, timeoutMs: number) => Promise<T[]>,
): Promise<Array<T[] | BoardFailure>> {
  const pass = (items: B[], limit: number, ms: number) =>
    mapWithinDeadline(items, limit, Date.now(), Number.POSITIVE_INFINITY, async (board) =>
      [board, await read(board, ms).catch((error: unknown) => boardFailure(board.company, error))] as const);
  const first = await pass(boards, concurrency, timeoutMs);
  const timedOut = first
    .filter(([, result]) => result instanceof BoardFailure && result.reason === "timeout")
    .map(([board]) => board);
  const retried = new Map(await pass(timedOut, 4, timeoutMs * 2));
  return first.map(([board, result]) => retried.get(board) ?? result);
}

/** The failures of a provider's last run, cleared once read. */
export function takeBoardFailures(provider: string) {
  const failures = boardFailures.get(provider) ?? [];
  boardFailures.delete(provider);
  return failures;
}

export function describeFailures(failures: BoardFailure[]) {
  if (failures.length === 0) return "";
  const byReason = new Map<string, string[]>();
  for (const failure of failures) {
    byReason.set(failure.reason, [...(byReason.get(failure.reason) ?? []), failure.board]);
  }
  return `: ${[...byReason].map(([reason, boards]) => `${reason} ×${boards.length} (${boards.slice(0, 8).join(", ")}${boards.length > 8 ? ", …" : ""})`).join("; ")}`;
}
