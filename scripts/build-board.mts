// Fetches every job source and publishes the board. Runs in GitHub Actions, never on Vercel.
// Without BLOB_READ_WRITE_TOKEN it only reports, which is how a new runner is tested.
import { alertKey, digestDue, isAlertRole, sendAlert } from "../src/features/jobs/alerts";
import { alertsPath, boardPath, readStored, recentPath, writeStored } from "../src/features/jobs/board-store";
import { buildBoard, snapshotRejectionReason, type Board } from "../src/features/jobs/service";

type AlertState = { keys: string[]; lastDigest: string | null };

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

  // New roles at the target companies, remote or in Washington, go out in one
  // email a day. The first build only remembers what is already open, so
  // nobody gets a flood; a role is remembered only once an email carried it.
  const matches = board.rows.filter(isAlertRole);
  const stored = await readStored<string[] | AlertState>(alertsPath);
  const state: AlertState | null = Array.isArray(stored) ? { keys: stored, lastDigest: null } : stored;
  if (!state) {
    await writeStored(alertsPath, { keys: matches.map(alertKey), lastDigest: null });
    console.log(`Alerts: remembered ${matches.length} open roles; only new ones will be emailed`);
  } else {
    const known = new Set(state.keys);
    const fresh = matches.filter((row) => !known.has(alertKey(row)));
    const to = (process.env.ALERT_TO ?? "").split(",").map((address) => address.trim()).filter(Boolean);
    if (fresh.length === 0) {
      console.log("Alerts: nothing new");
    } else if (!digestDue(state.lastDigest)) {
      console.log(`Alerts: ${fresh.length} new, waiting for today's digest`);
    } else if (!process.env.ALERT_FROM || to.length === 0) {
      console.log(`Alerts: ${fresh.length} new, not sent because ALERT_FROM or ALERT_TO is missing`);
    } else {
      try {
        sendAlert(fresh, { from: process.env.ALERT_FROM, to, region: process.env.ALERT_REGION ?? "us-east-2" });
        await writeStored(alertsPath, {
          keys: [...state.keys, ...fresh.map(alertKey)],
          lastDigest: new Date().toISOString().slice(0, 10),
        });
        console.log(`Alerts: digest sent with ${fresh.length} new roles`);
      } catch (error) {
        // Not remembered, so the next build tries the same roles again.
        console.error(`Alerts: ${fresh.length} new, not sent, will retry: ${error instanceof Error ? error.message.slice(0, 300) : error}`);
      }
    }
  }
}

// Provider timeouts leave timers running; the work is done.
process.exit(0);
