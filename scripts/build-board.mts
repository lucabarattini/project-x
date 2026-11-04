// Fetches every job source and publishes the board. Runs in GitHub Actions, never on Vercel.
// Without BLOB_READ_WRITE_TOKEN it only reports, which is how a new runner is tested.
import { boardPath, readStored, recentPath, writeStored } from "../src/features/jobs/board-store";
import { buildBoard, snapshotRejectionReason, type Board } from "../src/features/jobs/service";

const publishing = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const previous = publishing ? await readStored<Board>(boardPath) : null;
const startedAt = Date.now();
const { board, recent } = await buildBoard(previous);

for (const { provider, status, jobCount, durationMs, message } of board.diagnostics) {
  console.log(provider.padEnd(11), status.padEnd(8), String(jobCount).padStart(6), `${(durationMs / 1000).toFixed(1)}s`.padStart(7), message ?? "");
}
const healthy = board.diagnostics.filter(({ status }) => status === "ok" || status === "empty").length;
console.log(`${board.rows.length} postings, ${recent.length} recent, ${healthy} of ${board.diagnostics.length} sources in ${Math.round((Date.now() - startedAt) / 1000)}s`);

const rejected = snapshotRejectionReason(board.rows.length, board.diagnostics, previous?.rows.length);
if (rejected) {
  console.error(`Not published: ${rejected}`);
  process.exit(1);
}
if (publishing) {
  await writeStored(boardPath, board);
  await writeStored(recentPath, recent);
  console.log("Published");
}
// Provider timeouts leave timers running; the work is done.
process.exit(0);
