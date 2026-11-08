import assert from "node:assert/strict";
import test from "node:test";
import {
  filterComparisons,
  latestProposal,
  approvalIsStale,
  comparisonNotice,
} from "./presentation";
import type { Room, Run } from "./view-model";
import { investigationPresentation } from "./investigation";

test("agent presentation reconstructs ordered chunks and preserves partial failure", () => {
  const result = {
    state: "partial",
    requestedModelId: "model",
    actualModelIds: ["model"],
    calls: 8,
    correctionCalls: 1,
    toolRequests: 10,
    distinctCases: 5,
    durationMs: 100,
    roles: {
      orchestrator: { state: "failed", reason: "Invalid citation" },
      behavior: { state: "completed" },
      policy: { state: "completed" },
      regression: { state: "queued" },
    },
    events: [],
    proposals: [],
  };
  const json = JSON.stringify(result),
    middle = Math.floor(json.length / 2);
  const rows = [
    {
      id: "2",
      label: `Investigation JSON 2/2\n${json.slice(middle)}`,
      state: "recorded",
      createdAt: "",
    },
    {
      id: "1",
      label: `Investigation JSON 1/2\n${json.slice(0, middle)}`,
      state: "recorded",
      createdAt: "",
    },
  ];
  assert.equal(
    investigationPresentation(rows).outcome?.roles.orchestrator.state,
    "failed",
  );
  assert.equal(investigationPresentation(rows).outcome?.state, "partial");
  assert.equal(investigationPresentation(rows).ordinary.length, 0);
  assert.equal(investigationPresentation(rows.slice(0, 1)).incomplete, true);
  assert.equal(
    investigationPresentation([...rows, rows[0]!]).outcome,
    undefined,
  );
});

test("live agent events stay distinct from ordinary activity and malformed JSON", () => {
  const rows = [
    {
      id: "1",
      label: JSON.stringify({
        role: "policy",
        state: "failed",
        summary: "Evidence unavailable",
      }),
      state: "failed",
      createdAt: "",
    },
    {
      id: "2",
      label: "Measured comparison finished",
      state: "completed",
      createdAt: "",
    },
    {
      id: "3",
      label: '{"role":"attacker","state":"completed"}',
      state: "completed",
      createdAt: "",
    },
  ];
  const parsed = investigationPresentation(rows);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.state, "failed");
  assert.equal(parsed.ordinary.length, 1);
  assert.equal(parsed.outcome, undefined);
  assert.equal(parsed.unreadableEvents, true);
});

test("failed executions never receive a no-differences conclusion", () => {
  assert.equal(
    comparisonNotice(undefined).title,
    "Waiting for measured results",
  );
  assert.equal(
    comparisonNotice({ cases: [], mismatch_count: 0, error_count: 1 }).title,
    "Comparison contains execution errors",
  );
  assert.equal(
    comparisonNotice({ cases: [], mismatch_count: 0, error_count: 0 }).title,
    "No mismatch to review",
  );
});

const run = (id: string, reviewState: Run["reviewState"]): Run => ({
  id,
  reviewState,
  baseline: "legacy-v1",
  candidate: "rewrite-v2",
  modelId: "",
  createdAt: "2026-11-08T08:00:00Z",
  state: "compared",
  comparison: { cases: [], mismatch_count: 1, error_count: 0 },
  evidence: [],
  proposals: [],
  decisions: [],
  comments: [],
  pins: [],
  activity: [],
});

test("review queue excludes decided runs but keeps deferred work", () => {
  const room: Room = {
    id: "r",
    name: "Returns",
    owner: "a",
    members: [],
    runs: [
      run("open", "needs_review"),
      run("later", "deferred"),
      run("done", "decided"),
    ],
  };
  assert.deepEqual(
    filterComparisons([room], "queue").map((item) => item.run.id),
    ["open", "later"],
  );
  assert.deepEqual(
    filterComparisons([room], "history").map((item) => item.run.id),
    ["done"],
  );
});

test("approval preview becomes stale when proposal or decision advances, or connection drops", () => {
  assert.equal(
    approvalIsStale({ revision: 2, decisionVersion: 1 }, 3, 1, true),
    true,
  );
  assert.equal(
    approvalIsStale({ revision: 2, decisionVersion: 1 }, 2, 2, true),
    true,
  );
  assert.equal(
    approvalIsStale({ revision: 2, decisionVersion: 1 }, 2, 1, false),
    true,
  );
  assert.equal(
    approvalIsStale({ revision: 2, decisionVersion: 1 }, 2, 1, true),
    false,
  );
});

test("proposal selection uses revision, not subscription arrival order", () => {
  const item = run("one", "needs_review");
  const base = {
    author: "a",
    choice: "include" as const,
    rationale: "Policy",
    evidenceIds: [],
    cases: [],
    createdAt: "",
  };
  item.proposals = [
    { ...base, revision: 1 },
    { ...base, revision: 3 },
  ];
  assert.equal(latestProposal(item)?.revision, 3);
});

test("review queue does not invent findings for matching or unexecuted runs", () => {
  const matching = run("matching", "needs_review");
  matching.comparison = { cases: [], mismatch_count: 0, error_count: 0 };
  const pending = run("pending", "needs_review");
  pending.comparison = undefined;
  const room: Room = {
    id: "r",
    name: "Returns",
    owner: "a",
    members: [],
    runs: [matching, pending],
  };
  assert.equal(filterComparisons([room], "queue").length, 0);
  assert.equal(filterComparisons([room], "comparisons").length, 2);
});
