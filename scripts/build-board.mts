// Fetches every job source and publishes the board. Runs in GitHub Actions, never on Vercel.
// Without BLOB_READ_WRITE_TOKEN it only reports, which is how a new runner is tested.
import { alertKey, digestDue, isAlertRole, judgeFit, sendAlert } from "../src/features/jobs/alerts";
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
  // email a day, but only those GPT-6 Luna judges a real fit for Gemma. The
  // first build only remembers what is already open, so nobody gets a flood.
  // A role is remembered once it was emailed or judged not a fit; one with no
  // verdict, or an email that failed, is tried again on the next build.
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
    } else if (!process.env.ALERT_FROM || to.length === 0 || !process.env.OPENAI_API_KEY) {
      console.log(`Alerts: ${fresh.length} new, not sent because ALERT_FROM, ALERT_TO or OPENAI_API_KEY is missing`);
    } else {
      const fits = await judgeFit(fresh, new Map(recent.map((posting) => [posting.key, posting.text])), process.env.OPENAI_API_KEY);
      const relevant = fresh.filter((row) => fits.get(row) === true);
      const rejected = fresh.filter((row) => fits.get(row) === false);
      let sent = false;
      if (relevant.length > 0) {
        try {
          sendAlert(relevant, { from: process.env.ALERT_FROM, to, region: process.env.ALERT_REGION ?? "us-east-2", skipped: rejected.length });
          sent = true;
        } catch (error) {
          console.error(`Alerts: ${relevant.length} to send, failed, will retry: ${error instanceof Error ? error.message.slice(0, 300) : error}`);
        }
      }
      const done = [...rejected, ...(sent ? relevant : [])];
      await writeStored(alertsPath, {
        keys: [...state.keys, ...done.map(alertKey)],
        lastDigest: sent ? new Date().toISOString().slice(0, 10) : state.lastDigest,
      });
      console.log(`Alerts: ${fresh.length} new, ${relevant.length} a fit${sent ? " and emailed" : ""}, ${rejected.length} not a fit, ${fresh.length - fits.size} without a verdict`);
    }
  }
}

// Provider timeouts leave timers running; the work is done.
process.exit(0);
