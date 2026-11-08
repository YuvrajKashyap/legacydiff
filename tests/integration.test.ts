import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { DbConnection } from "../packages/client/generated";
import type { Comparison, Job } from "../packages/client/generated/types";
import {
  comparisonSchema,
  validationResultSchema,
} from "../packages/contracts/validation";
import {
  catalogToWire,
  comparisonToWire,
  roomFromWire,
  validationToWire,
} from "../packages/contracts/wire";
import { workerConnection } from "../backend/worker/bootstrap";
import { readCatalog } from "../backend/worker/catalog";
import { connectDatabase } from "../backend/worker/database";
import { runPython } from "../backend/worker/runner";

// These checks change worker configuration and create approvals. Keep them away from the demo.
if (process.env.LEGACYDIFF_DB_PORT !== "3012") {
  throw new Error(
    "Run database verification on the isolated local server: set LEGACYDIFF_DB_PORT=3012 first.",
  );
}

async function eventually(
  check: () => boolean,
  message: string,
  timeout = 8000,
) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(message);
    await delay(25);
  }
}

function room(connection: DbConnection, roomId: string) {
  return [...connection.db.visibleRooms.iter()].find(
    (item) => item.id === roomId,
  );
}

function job(connection: DbConnection, jobId: string) {
  return [...connection.db.workerJobs.iter()].find((item) => item.id === jobId);
}

async function fixtureComparison(): Promise<Comparison> {
  const result = comparisonSchema.parse(
    await runPython({
      op: "compare",
      baseline: "legacy-v1",
      candidate: "rewrite-v2",
    }),
  );
  return comparisonToWire({
    cases: result.cases.map((item) => ({
      ...item,
      baseline: {
        ...item.baseline,
        status:
          item.baseline.status === "cancelled" ? "error" : item.baseline.status,
        diagnostic: item.baseline.diagnostic ?? undefined,
      },
      candidate: {
        ...item.candidate,
        status:
          item.candidate.status === "cancelled"
            ? "error"
            : item.candidate.status,
        diagnostic: item.candidate.diagnostic ?? undefined,
      },
    })),
    mismatch_count: result.mismatch_count,
    error_count: result.error_count,
  });
}

test(
  "live Spacetime authorization, revision conflicts, receipts and worker commits",
  { timeout: 60000 },
  async (t) => {
    const sessions: Array<Awaited<ReturnType<typeof connectDatabase>>> = [];
    try {
      const worker = await workerConnection();
      sessions.push(worker);
      const owner = await connectDatabase();
      sessions.push(owner);
      const reviewer = await connectDatabase();
      sessions.push(reviewer);
      const outsider = await connectDatabase();
      sessions.push(outsider);
      assert.equal(new Set(sessions.map((item) => item.identity)).size, 4);

      const catalog = catalogToWire(await readCatalog());
      await worker.connection.reducers.updateCatalog({ value: catalog });
      const comparison = await fixtureComparison();
      const roomId = `integration-${randomUUID()}`;
      const runId = randomUUID();
      const address = { roomId, runId };
      const reducers = owner.connection.reducers;
      const workerReducers = worker.connection.reducers;
      await reducers.createRoom({
        roomId,
        name: "Integration verification",
        label: "Owner",
        requestId: randomUUID(),
      });
      await eventually(
        () => Boolean(room(owner.connection, roomId)),
        "Owner subscription did not receive its room",
      );

      await t.test(
        "third identity cannot read or mutate the room, grant admission, or act as worker",
        async () => {
          assert.equal(room(outsider.connection, roomId), undefined);
          await assert.rejects(
            outsider.connection.reducers.addComment({
              ...address,
              requestId: randomUUID(),
              text: "Unauthorized comment",
            }),
          );
          await assert.rejects(
            outsider.connection.reducers.updateCatalog({ value: catalog }),
          );
          await reviewer.connection.reducers.requestJoin({
            roomId,
            label: "Reviewer",
          });
          const requestId = `${roomId}:${reviewer.identity}`;
          await eventually(
            () =>
              [...owner.connection.db.visibleRequests.iter()].some(
                (item) => item.id === requestId,
              ),
            "Owner did not receive admission request",
          );
          await assert.rejects(
            outsider.connection.reducers.admitMember({
              requestId,
              role: "reviewer",
            }),
          );
          await reducers.admitMember({ requestId, role: "reviewer" });
          await eventually(
            () => Boolean(room(reviewer.connection, roomId)),
            "Admitted reviewer did not receive room",
          );
        },
      );

      const start = {
        ...address,
        candidate: "rewrite-v2",
        modelId: "deterministic",
        withAi: false,
        requestId: randomUUID(),
      };
      await t.test(
        "duplicate start replays once and changed payload is rejected",
        async () => {
          await reducers.startRun(start);
          await reducers.startRun(start);
          await assert.rejects(
            reducers.startRun({ ...start, candidate: "corrected-v2" }),
          );
          await eventually(
            () => Boolean(job(worker.connection, `compare:${runId}`)),
            "Worker did not receive comparison",
          );
          assert.equal(room(owner.connection, roomId)?.runs.length, 1);
        },
      );

      const compareJobId = `compare:${runId}`;
      await workerReducers.claimJob({ jobId: compareJobId });
      await eventually(
        () => job(worker.connection, compareJobId)?.attempt === 1,
        "Claim not reflected",
      );
      const claimed = job(worker.connection, compareJobId)!;
      const commit = {
        jobId: compareJobId,
        attempt: claimed.attempt,
        candidateHash: claimed.candidateHash,
        comparison,
        validation: undefined,
        diagnostic: "",
      };
      await t.test(
        "measured results publish before completion and reject unauthorized or forged updates",
        async () => {
          const record = {
            jobId: compareJobId,
            attempt: claimed.attempt,
            candidateHash: claimed.candidateHash,
            comparison,
          };
          await assert.rejects(
            outsider.connection.reducers.recordComparison(record),
          );
          await assert.rejects(
            workerReducers.recordComparison({ ...record, attempt: 0 }),
          );
          await assert.rejects(
            workerReducers.recordComparison({
              ...record,
              candidateHash: "0".repeat(64),
            }),
          );
          await assert.rejects(
            workerReducers.recordComparison({
              ...record,
              comparison: { ...comparison, mismatchCount: 0 },
            }),
          );
          const wrongSource = structuredClone(comparison);
          wrongSource.cases[0].baseline.sha256 = "0".repeat(64);
          await assert.rejects(
            workerReducers.recordComparison({
              ...record,
              comparison: wrongSource,
            }),
          );
          const wrongVerdict = structuredClone(comparison);
          wrongVerdict.cases[0].state = "mismatch";
          await assert.rejects(
            workerReducers.recordComparison({
              ...record,
              comparison: wrongVerdict,
            }),
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].comparison,
            undefined,
          );
          await workerReducers.recordComparison(record);
          await eventually(
            () =>
              room(reviewer.connection, roomId)?.runs[0].comparison
                ?.mismatchCount === 1,
            "Measured comparison not published before completion",
          );
          assert.equal(
            room(reviewer.connection, roomId)?.runs[0].state,
            "running",
          );
          assert.equal(job(worker.connection, compareJobId)?.state, "running");
        },
      );
      await t.test(
        "worker result requires current attempt and pinned hash",
        async () => {
          await assert.rejects(outsider.connection.reducers.commitJob(commit));
          await assert.rejects(
            workerReducers.commitJob({ ...commit, attempt: 0 }),
          );
          await assert.rejects(
            workerReducers.commitJob({
              ...commit,
              candidateHash: "0".repeat(64),
            }),
          );
          await workerReducers.commitJob(commit);
          await workerReducers.commitJob(commit);
          await assert.rejects(
            workerReducers.commitJob({
              ...commit,
              comparison: { ...comparison, mismatchCount: 0 },
            }),
          );
          await assert.rejects(
            workerReducers.recordComparison({
              jobId: compareJobId,
              attempt: claimed.attempt,
              candidateHash: claimed.candidateHash,
              comparison,
            }),
          );
          await eventually(
            () =>
              room(reviewer.connection, roomId)?.runs[0].comparison
                ?.mismatchCount === 1,
            "Actual finding not shared",
          );
          assert.equal(
            room(reviewer.connection, roomId)?.runs[0].comparison?.cases.find(
              (item) => item.id === "day-30",
            )?.baseline.output?.refundCents,
            10000,
          );
        },
      );

      await t.test(
        "concurrent comments append without overwriting",
        async () => {
          await Promise.all([
            reducers.addComment({
              ...address,
              requestId: randomUUID(),
              text: "Owner contribution",
            }),
            reviewer.connection.reducers.addComment({
              ...address,
              requestId: randomUUID(),
              text: "Reviewer challenge",
            }),
          ]);
          await eventually(
            () =>
              room(reviewer.connection, roomId)?.runs[0].comments.length === 2,
            "Concurrent comments were lost",
          );
          await reviewer.connection.reducers.pinEvidence({
            ...address,
            requestId: randomUUID(),
            evidenceId: "migration-ticket",
          });
          await eventually(
            () => room(owner.connection, roomId)?.runs[0].pins.length === 1,
            "Evidence pin not shared",
          );
        },
      );

      await reducers.publishProposal({
        ...address,
        expectedRevision: 0,
        choice: "include",
        rationale: "Test approval of inclusive policy",
        evidenceIds: ["operations-handbook", "migration-ticket"],
        requestId: randomUUID(),
      });
      await t.test(
        "stale approval and conflicting proposal edits are rejected",
        async () => {
          await reducers.publishProposal({
            ...address,
            expectedRevision: 1,
            choice: "include",
            rationale: "Revised test rationale",
            evidenceIds: ["operations-handbook", "migration-ticket"],
            requestId: randomUUID(),
          });
          await assert.rejects(
            reviewer.connection.reducers.approveProposal({
              ...address,
              expectedRevision: 1,
              expectedDecisionVersion: 0,
              requestId: randomUUID(),
            }),
          );
          await assert.rejects(
            reviewer.connection.reducers.publishProposal({
              ...address,
              expectedRevision: 1,
              choice: "exclude",
              rationale: "Obsolete edit",
              evidenceIds: ["operations-handbook", "migration-ticket"],
              requestId: randomUUID(),
            }),
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].decisions.length,
            0,
          );
        },
      );

      await t.test(
        "racing approvals commit exactly one decision and validation job",
        async () => {
          const requests = [randomUUID(), randomUUID()];
          const attempts = await Promise.allSettled([
            reducers.approveProposal({
              ...address,
              expectedRevision: 2,
              expectedDecisionVersion: 0,
              requestId: requests[0],
            }),
            reviewer.connection.reducers.approveProposal({
              ...address,
              expectedRevision: 2,
              expectedDecisionVersion: 0,
              requestId: requests[1],
            }),
          ]);
          assert.equal(
            attempts.filter((item) => item.status === "fulfilled").length,
            1,
          );
          await eventually(
            () =>
              room(owner.connection, roomId)?.runs[0].decisions.length === 1,
            "Decision missing",
          );
          await eventually(
            () =>
              [...worker.connection.db.workerJobs.iter()].filter(
                (item) => item.runId === runId && item.kind === "validate",
              ).length === 1,
            "Validation job not unique",
          );
          const winner = attempts[0].status === "fulfilled" ? owner : reviewer;
          const requestId = winner === owner ? requests[0] : requests[1];
          await winner.connection.reducers.approveProposal({
            ...address,
            expectedRevision: 2,
            expectedDecisionVersion: 0,
            requestId,
          });
          await assert.rejects(
            winner.connection.reducers.approveProposal({
              ...address,
              expectedRevision: 1,
              expectedDecisionVersion: 0,
              requestId,
            }),
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].decisions.length,
            1,
          );
        },
      );

      await t.test(
        "cancelled queued validation cannot be claimed or committed",
        async () => {
          await reducers.cancelRun({ ...address, requestId: randomUUID() });
          const validationJobId = `validate:${runId}:1`;
          await eventually(
            () =>
              job(worker.connection, validationJobId)?.state === "cancelled",
            "Cancellation not reflected",
          );
          const cancelled = job(worker.connection, validationJobId)!;
          await assert.rejects(
            workerReducers.claimJob({ jobId: validationJobId }),
          );
          await assert.rejects(
            workerReducers.commitJob({
              jobId: validationJobId,
              attempt: cancelled.attempt,
              candidateHash: cancelled.candidateHash,
              comparison: undefined,
              validation: undefined,
              diagnostic: "",
            }),
          );
        },
      );

      await t.test(
        "reconnect restores shared data without duplicate work",
        async () => {
          reviewer.connection.disconnect();
          const reconnected = await connectDatabase(reviewer.token);
          sessions.push(reconnected);
          assert.equal(reconnected.identity, reviewer.identity);
          const restored = room(reconnected.connection, roomId)!;
          assert.equal(restored.runs.length, 1);
          assert.equal(restored.runs[0].decisions.length, 1);
          assert.equal(restored.runs[0].comments.length, 2);
          assert.equal(room(outsider.connection, roomId), undefined);
        },
      );
    } finally {
      for (const session of sessions) session.connection.disconnect();
    }
  },
);

test(
  "real lease expiry rejects old commits, reclaims work, and finishes cancellation",
  {
    timeout: 90000,
    skip: process.env.LEGACYDIFF_LEASE_TEST !== "1",
  },
  async () => {
    const sessions: Array<Awaited<ReturnType<typeof connectDatabase>>> = [];
    try {
      const worker = await workerConnection();
      sessions.push(worker);
      const owner = await connectDatabase();
      sessions.push(owner);
      await worker.connection.reducers.updateCatalog({
        value: catalogToWire(await readCatalog()),
      });
      const comparison = await fixtureComparison();
      const runs: Array<{ roomId: string; runId: string; claimed: Job }> = [];
      for (const name of ["reclaim", "cancel"]) {
        const roomId = `lease-${name}-${randomUUID()}`;
        const runId = randomUUID();
        await owner.connection.reducers.createRoom({
          roomId,
          name: "Lease verification",
          label: "Owner",
          requestId: randomUUID(),
        });
        await owner.connection.reducers.startRun({
          roomId,
          runId,
          candidate: "rewrite-v2",
          modelId: "deterministic",
          withAi: false,
          requestId: randomUUID(),
        });
        const jobId = `compare:${runId}`;
        await worker.connection.reducers.claimJob({ jobId });
        await eventually(
          () => job(worker.connection, jobId)?.attempt === 1,
          "Lease claim missing",
        );
        runs.push({
          roomId,
          runId,
          claimed: { ...job(worker.connection, jobId)! },
        });
      }
      await owner.connection.reducers.cancelRun({
        roomId: runs[1].roomId,
        runId: runs[1].runId,
        requestId: randomUUID(),
      });
      await eventually(
        () =>
          job(worker.connection, runs[1].claimed.id)?.state === "cancelling",
        "Running cancellation not reflected",
      );

      // Real server time, not a patched clock or synthetic lease record.
      const lastExpiry = Math.max(
        ...runs.map((item) => Number(item.claimed.leaseUntil / 1000n)),
      );
      while (Date.now() <= lastExpiry + 100) await delay(500);
      const old = runs[0].claimed;
      const oldCommit = {
        jobId: old.id,
        attempt: old.attempt,
        candidateHash: old.candidateHash,
        comparison,
        validation: undefined,
        diagnostic: "",
      };
      await assert.rejects(worker.connection.reducers.commitJob(oldCommit));
      await worker.connection.reducers.recoverExpiredJobs({});
      await eventually(
        () => job(worker.connection, runs[1].claimed.id)?.state === "cancelled",
        "Expired cancellation did not finish",
      );
      await worker.connection.reducers.claimJob({ jobId: old.id });
      await eventually(
        () => job(worker.connection, old.id)?.attempt === 2,
        "Expired job was not reclaimed",
      );
      await assert.rejects(worker.connection.reducers.commitJob(oldCommit));
      await worker.connection.reducers.commitJob({ ...oldCommit, attempt: 2 });
      await eventually(
        () =>
          room(owner.connection, runs[0].roomId)?.runs[0].state === "compared",
        "Reclaimed attempt did not finish",
      );
      assert.equal(
        room(owner.connection, runs[1].roomId)?.runs[0].state,
        "cancelled",
      );
    } finally {
      for (const session of sessions) session.connection.disconnect();
    }
  },
);

test(
  "live approvals bind include/exclude validations to immutable revisions",
  { timeout: 60000 },
  async (t) => {
    const sessions: Array<Awaited<ReturnType<typeof connectDatabase>>> = [];
    try {
      const worker = await workerConnection();
      sessions.push(worker);
      const owner = await connectDatabase();
      sessions.push(owner);
      const reducers = owner.connection.reducers;
      const workerReducers = worker.connection.reducers;
      await workerReducers.updateCatalog({
        value: catalogToWire(await readCatalog()),
      });
      const comparison = await fixtureComparison();
      const roomId = `revision-${randomUUID()}`;
      const runId = randomUUID();
      const address = { roomId, runId };
      await reducers.createRoom({
        roomId,
        name: "Revision verification",
        label: "Owner",
        requestId: randomUUID(),
      });
      await reducers.startRun({
        ...address,
        candidate: "rewrite-v2",
        modelId: "deterministic",
        withAi: false,
        requestId: randomUUID(),
      });
      const comparisonJobId = `compare:${runId}`;
      await workerReducers.claimJob({ jobId: comparisonJobId });
      await eventually(
        () => job(worker.connection, comparisonJobId)?.attempt === 1,
        "Comparison claim missing",
      );
      const comparisonJob = job(worker.connection, comparisonJobId)!;
      await workerReducers.recordComparison({
        jobId: comparisonJobId,
        attempt: 1,
        candidateHash: comparisonJob.candidateHash,
        comparison,
      });
      await workerReducers.commitJob({
        jobId: comparisonJobId,
        attempt: 1,
        candidateHash: comparisonJob.candidateHash,
        comparison,
        validation: undefined,
        diagnostic: "",
      });

      await t.test("defer creates no approval or validation job", async () => {
        await reducers.setReviewState({
          ...address,
          state: "deferred",
          text: "",
          requestId: randomUUID(),
        });
        await eventually(
          () =>
            room(owner.connection, roomId)?.runs[0].reviewState === "deferred",
          "Defer missing",
        );
        assert.equal(
          room(owner.connection, roomId)?.runs[0].decisions.length,
          0,
        );
        assert.equal(
          [...worker.connection.db.workerJobs.iter()].filter(
            (item) => item.runId === runId && item.kind === "validate",
          ).length,
          0,
        );
      });

      const published = [];
      for (const [index, choice] of (
        ["include", "exclude"] as const
      ).entries()) {
        await reducers.publishProposal({
          ...address,
          expectedRevision: index,
          choice,
          rationale: `Review ${choice} interpretation`,
          evidenceIds: ["operations-handbook", "migration-ticket"],
          requestId: randomUUID(),
        });
        await reducers.approveProposal({
          ...address,
          expectedRevision: index + 1,
          expectedDecisionVersion: index,
          requestId: randomUUID(),
        });
        const jobId = `validate:${runId}:${index + 1}`;
        await workerReducers.claimJob({ jobId });
        await eventually(
          () =>
            job(worker.connection, jobId)?.attempt === 1 &&
            room(owner.connection, roomId)?.runs[0].decisions.length ===
              index + 1,
          "Validation claim missing",
        );
        const claimed = job(worker.connection, jobId)!;
        const decision = roomFromWire(room(owner.connection, roomId)!).runs[0]
          .decisions[index];
        const actual = validationResultSchema.parse(
          await runPython({
            op: "validate",
            variant: "rewrite-v2",
            approved_cases: decision.cases,
          }),
        );
        published.push({
          jobId,
          attempt: claimed.attempt,
          candidateHash: claimed.candidateHash,
          comparison: undefined,
          validation: validationToWire({
            state: actual.state,
            candidate: "rewrite-v2",
            candidateHash: claimed.candidateHash,
            cases: actual.cases.map((item) => ({
              id: item.id,
              expected: item.expected,
              actual: item.actual ?? undefined,
              state: item.state,
            })),
          }),
          diagnostic: "",
        });
      }
      const [inclusive, exclusive] = published;
      assert.equal(inclusive.validation.state, "fail");
      assert.equal(exclusive.validation.state, "pass");

      await t.test(
        "validation refuses altered scope, expectations and false pass verdicts",
        async () => {
          const wrongScope = structuredClone(inclusive);
          wrongScope.validation.cases.pop();
          await assert.rejects(workerReducers.commitJob(wrongScope));
          const wrongExpected = structuredClone(inclusive);
          wrongExpected.validation.cases[0].expected.refundCents = 1;
          await assert.rejects(workerReducers.commitJob(wrongExpected));
          const wrongVerdict = structuredClone(inclusive);
          wrongVerdict.validation.cases[1].state = "pass";
          await assert.rejects(workerReducers.commitJob(wrongVerdict));
          const wrongSummary = structuredClone(inclusive);
          wrongSummary.validation.state = "pass";
          await assert.rejects(workerReducers.commitJob(wrongSummary));
          assert.equal(
            room(owner.connection, roomId)?.runs[0].decisions[0].validation
              ?.state,
            "running",
          );
        },
      );

      await t.test(
        "late old validation stays under its original decision and cannot overwrite completion",
        async () => {
          await workerReducers.commitJob(exclusive);
          await workerReducers.commitJob(inclusive);
          await workerReducers.commitJob(inclusive);
          await eventually(
            () =>
              room(owner.connection, roomId)?.runs[0].decisions[0].validation
                ?.state === "fail",
            "Old validation missing",
          );
          const decisions = room(owner.connection, roomId)!.runs[0].decisions;
          assert.equal(decisions[0].proposalRevision, 1);
          assert.equal(decisions[0].validation?.state, "fail");
          assert.equal(decisions[1].proposalRevision, 2);
          assert.equal(decisions[1].validation?.state, "pass");
          await assert.rejects(
            workerReducers.commitJob({
              ...inclusive,
              validation: exclusive.validation,
            }),
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].decisions[1].validation
              ?.state,
            "pass",
          );
        },
      );

      await t.test(
        "deferring a new unapproved revision preserves decisions without creating tests",
        async () => {
          await reducers.publishProposal({
            ...address,
            expectedRevision: 2,
            choice: "include",
            rationale: "New revision awaiting review",
            evidenceIds: ["operations-handbook", "migration-ticket"],
            requestId: randomUUID(),
          });
          await reducers.setReviewState({
            ...address,
            state: "deferred",
            text: "",
            requestId: randomUUID(),
          });
          await eventually(
            () =>
              room(owner.connection, roomId)?.runs[0].reviewState ===
              "deferred",
            "Revision defer missing",
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].proposals.length,
            3,
          );
          assert.equal(
            room(owner.connection, roomId)?.runs[0].decisions.length,
            2,
          );
          assert.equal(
            [...worker.connection.db.workerJobs.iter()].filter(
              (item) => item.runId === runId && item.kind === "validate",
            ).length,
            2,
          );
        },
      );
      await t.test(
        "saved measurements survive a later worker failure",
        async () => {
          const failedRunId = randomUUID();
          await reducers.startRun({
            roomId,
            runId: failedRunId,
            candidate: "rewrite-v2",
            modelId: "deterministic",
            withAi: false,
            requestId: randomUUID(),
          });
          const failedJobId = `compare:${failedRunId}`;
          await workerReducers.claimJob({ jobId: failedJobId });
          await eventually(
            () => job(worker.connection, failedJobId)?.attempt === 1,
            "Failure scenario claim missing",
          );
          const failedJob = job(worker.connection, failedJobId)!;
          await workerReducers.recordComparison({
            jobId: failedJobId,
            attempt: 1,
            candidateHash: failedJob.candidateHash,
            comparison,
          });
          await workerReducers.commitJob({
            jobId: failedJobId,
            attempt: 1,
            candidateHash: failedJob.candidateHash,
            comparison: undefined,
            validation: undefined,
            diagnostic: "Controlled integration failure after measurements",
          });
          await eventually(
            () =>
              room(owner.connection, roomId)?.runs.find(
                (item) => item.id === failedRunId,
              )?.state === "error",
            "Failure was not recorded",
          );
          const failedRun = room(owner.connection, roomId)!.runs.find(
            (item) => item.id === failedRunId,
          )!;
          assert.equal(failedRun.comparison?.mismatchCount, 1);
          assert.equal(
            failedRun.comparison?.cases.find((item) => item.id === "day-30")
              ?.candidate.output?.refundCents,
            0,
          );
          assert.equal(failedRun.decisions.length, 0);
        },
      );
    } finally {
      for (const session of sessions) session.connection.disconnect();
    }
  },
);
