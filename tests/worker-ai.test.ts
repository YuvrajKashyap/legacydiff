import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../backend/worker/catalog.ts";
import { catalogToWire } from "../packages/contracts/wire.ts";
import type { DbConnection } from "../packages/client/generated/index.ts";
import type { Job, Room } from "../packages/client/generated/types.ts";
import type { investigate } from "../backend/ai/index.ts";

test("matching measured run is persisted before completion and never fabricates an AI finding", async () => {
  const { executeJob } = await import("../backend/worker/jobs.ts");
  const catalog = await readCatalog();
  const wire = catalogToWire(catalog);
  const job: Job = {
    id: "job",
    roomId: "room",
    runId: "run",
    kind: "compare",
    decisionVersion: 0,
    candidate: "corrected-v2",
    candidateHash: catalog.variants.find((v) => v.id === "corrected-v2")!
      .sha256,
    state: "running",
    attempt: 1,
    leaseUntil: BigInt(Date.now() + 600000) * 1000n,
    withAi: true,
  };
  const room: Room = {
    id: "room",
    name: "Returns",
    owner: "owner",
    members: [],
    runs: [
      {
        id: "run",
        baseline: "legacy-v1",
        candidate: "corrected-v2",
        modelId: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        createdAt: new Date().toISOString(),
        state: "running",
        reviewState: "needs_review",
        comparison: undefined,
        evidence: wire.evidence,
        sourceVariants: wire.variants,
        proposals: [],
        decisions: [],
        comments: [],
        pins: [],
        activity: [],
        diagnostic: undefined,
      },
    ],
  };
  const stages: string[] = [];
  let finished:
    { comparison?: { mismatchCount: number }; diagnostic: string } | undefined;
  const connection = {
    db: { workerRooms: { iter: () => [room] } },
    reducers: {
      recordComparison: async () => {
        stages.push("measured");
      },
      recordActivity: async () => undefined,
      commitJob: async (value: typeof finished) => {
        stages.push("finished");
        finished = value;
      },
    },
  } as unknown as DbConnection;
  await executeJob(connection, job, catalog, new AbortController().signal);
  assert.deepEqual(stages, ["measured", "finished"]);
  assert.equal(finished?.comparison?.mismatchCount, 0);
  assert.match(
    finished?.diagnostic ?? "",
    /No differences.*AI investigation skipped/i,
  );
});

test("investigation activity stores complete numbered JSON chunks without silent truncation", async () => {
  const api = await import("../backend/worker/jobs.ts");
  assert.equal(typeof api.investigationActivity, "function");
  const result = {
    state: "partial",
    requestedModelId: "model",
    actualModelIds: ["model"],
    calls: 8,
    correctionCalls: 1,
    retries: 0,
    toolRequests: 12,
    distinctCases: 7,
    roles: {},
    events: [],
    proposals: [{ explanation: "Boundary evidence 🌍 ".repeat(300) }],
    durationMs: 1200,
  } as unknown as Awaited<ReturnType<typeof investigate>>;
  const records = api.investigationActivity(result, 20);
  assert.ok(records.every((record) => record.label.length <= 1900));
  const recovered = records
    .slice(1)
    .map((record) => record.label.slice(record.label.indexOf("\n") + 1))
    .join("");
  assert.deepEqual(JSON.parse(recovered), result);
  assert.throws(() => api.investigationActivity(result, 1), /budget|capacity/i);
});
