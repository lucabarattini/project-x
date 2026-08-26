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
