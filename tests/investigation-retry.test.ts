import test from "node:test";
import assert from "node:assert/strict";
import type { ScenarioRun } from "../packages/contracts/scenarios.ts";
import {
  beginInvestigation,
  updateInvestigation,
} from "../backend/database/spacetimedb/src/investigation-history.ts";

function savedRun() {
  return {
    id: "saved-case",
    state: "completed",
    modelId: "old-model",
    investigationState: "partial",
    investigation: JSON.stringify({ state: "partial", summary: "Old failure" }),
    aiTrace: [
      {
        id: "orchestrator",
        role: "orchestrator",
        kind: "agent",
        state: "failed",
        label: "Old failure",
        createdAt: "old-time",
      },
    ],
  } as unknown as ScenarioRun;
}
test("history works without structuredClone and does not share mutable trace rows", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "structuredClone",
  );
  Object.defineProperty(globalThis, "structuredClone", {
    value: undefined,
    configurable: true,
  });
  try {
    const run = savedRun();
    const originalTrace = run.aiTrace![0];
    const id = beginInvestigation(run, "new-model", "new-time");
    originalTrace.label = "Changed after archive";
    assert.equal(run.investigationAttempts![0].trace[0].label, "Old failure");
    run.aiTrace = [{ ...originalTrace, label: "Current event" }];
    updateInvestigation(run, id, "running");
    run.aiTrace[0].label = "Later change";
    assert.equal(run.investigationAttempts![1].trace[0].label, "Current event");
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "structuredClone", descriptor);
  }
});
test("a deliberate rerun keeps the old outcome and trace under a different job ID", () => {
  const run = savedRun();
  const old = structuredClone(run);
  const id = beginInvestigation(run, "new-model", "new-time");
  assert.equal(id, "saved-case:investigate:2");
  assert.equal(run.investigationAttempts?.[0].outcome, old.investigation);
  assert.deepEqual(run.investigationAttempts?.[0].trace, old.aiTrace);
  assert.equal(run.investigationAttempts?.[1].modelId, "new-model");
  assert.equal(run.investigationState, "queued");
  assert.deepEqual(run.aiTrace, []);
});
test("active work cannot be rerun and stale attempts cannot replace new progress", () => {
  const run = savedRun();
  const id = beginInvestigation(run, "new-model", "new-time");
  const before = JSON.stringify(run);
  assert.throws(
    () => beginInvestigation(run, "other-model", "later"),
    /active/i,
  );
  assert.equal(JSON.stringify(run), before);
  assert.throws(
    () =>
      updateInvestigation(run, "saved-case:investigate", "completed", {
        outcome: "old reply",
      }),
    /older/i,
  );
  updateInvestigation(run, id, "running");
  assert.equal(run.investigationState, "running");
});
test("a failed later attempt preserves the newest successful findings and has a bounded retry count", () => {
  const run = savedRun();
  const second = beginInvestigation(run, "new-model", "time-2");
  updateInvestigation(run, second, "completed", {
    outcome: "successful findings",
    completedAt: "done-2",
  });
  const third = beginInvestigation(run, "new-model", "time-3");
  updateInvestigation(run, third, "failed", {
    outcome: "failed findings",
    diagnostic: "Provider unavailable",
  });
  assert.equal(run.investigation, "successful findings");
  assert.equal(run.latestSuccessfulInvestigationId, second);
  assert.equal(run.investigationAttempts?.[2].outcome, "failed findings");
  for (let index = 4; index <= 10; index++) {
    const next = beginInvestigation(run, "new-model", `time-${index}`);
    updateInvestigation(run, next, "cancelled");
  }
  assert.throws(
    () => beginInvestigation(run, "new-model", "time-11"),
    /limit/i,
  );
});
