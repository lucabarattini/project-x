import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotRejectionReason } from "./service";
import type { ProviderDiagnostic } from "./service";

function diagnostics(statuses: ProviderDiagnostic["status"][]): ProviderDiagnostic[] {
  return statuses.map((status, index) => ({
    provider: `p${index}`,
    status,
    jobCount: status === "ok" ? 10 : 0,
    durationMs: 1_000,
    message: null,
  }));
}

const healthy = diagnostics([
  "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "empty", "empty",
]);

test("a healthy build is accepted", () => {
  assert.equal(snapshotRejectionReason(14_400, healthy), null);
});

test("a build where every source came back empty is rejected", () => {
  // A network outage makes every provider swallow its error and return [].
  assert.equal(
    snapshotRejectionReason(0, diagnostics(["empty", "empty", "empty"])),
    "every source came back empty",
  );
});

test("a build where most sources failed is rejected even when one returned data", () => {
  // The observed failure: a starved background revalidation left 6 of 11
  // sources erroring or timing out, and the one survivor's 10 jobs were enough
  // to pass a bare "is it empty" check. The board rendered 1 company.
  const starved = diagnostics([
    "timeout", "timeout", "timeout", "timeout", "error", "error",
    "empty", "empty", "empty", "empty", "ok",
  ]);
  assert.equal(snapshotRejectionReason(10, starved), "6 of 11 sources failed");
});

test("routine empty boards do not reject a build", () => {
  // Sources with no current openings are normal and must not look like an
  // outage: only errors and timeouts count toward the failure bar.
  const withEmpties = diagnostics([
    "ok", "ok", "ok", "ok", "ok", "ok",
    "empty", "empty", "empty", "empty", "timeout",
  ]);
  assert.equal(snapshotRejectionReason(9_000, withEmpties), null);
});

test("the bar is exactly half the sources", () => {
  assert.equal(snapshotRejectionReason(100, diagnostics(["ok", "ok", "timeout", "error"])), "2 of 4 sources failed");
  assert.equal(snapshotRejectionReason(100, diagnostics(["ok", "ok", "ok", "timeout"])), null);
});

test("a build that lost most of the board is rejected however its sources reported", () => {
  // The bug this exists for: five of eleven sources refused us, which sits one
  // short of the "half the sources" bar, so the build was cached and served as
  // a board of two roles against the ~14k that were there ten minutes earlier.
  const justUnderTheBar = diagnostics([
    "error", "error", "error", "error", "error",
    "empty", "empty", "empty", "empty", "ok", "ok",
  ]);
  assert.equal(snapshotRejectionReason(2, justUnderTheBar), null);
  assert.equal(
    snapshotRejectionReason(2, justUnderTheBar, 14_000),
    "2 entries against 14000 in the last good build",
  );
});

test("the size rule only bites on a real collapse, not on normal churn", () => {
  // Boards move by hundreds between builds; that must never be read as damage.
  assert.equal(snapshotRejectionReason(13_800, healthy, 14_000), null);
  assert.equal(snapshotRejectionReason(7_001, healthy, 14_000), null);
  assert.equal(
    snapshotRejectionReason(6_999, healthy, 14_000),
    "6999 entries against 14000 in the last good build",
  );
});

test("with no previous build to compare against, the size rule stays out of the way", () => {
  // A cold instance has nothing to measure against and must not refuse the
  // first real snapshot it manages to build.
  assert.equal(snapshotRejectionReason(2, healthy, 0), null);
});
