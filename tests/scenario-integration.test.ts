import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { workerConnection } from "../backend/worker/bootstrap.ts";
import { connectDatabase } from "../backend/worker/database.ts";
import { readCatalog } from "../backend/worker/catalog.ts";
import { runPython } from "../backend/worker/runner.ts";
import { catalogToWire } from "../packages/contracts/wire.ts";
import {
  scenarioRunSchema,
  suiteManifestSchema,
} from "../packages/contracts/scenarios.ts";

// These controlled outcomes must never enter the interactive workspace database.
const isolated = process.env.LEGACYDIFF_DB_PORT === "3012";
test(
  "isolated suite database protects retries, saved history, chat access and review versions",
  { skip: !isolated, timeout: 120000 },
  async (t) => {
    const sessions: Awaited<ReturnType<typeof connectDatabase>>[] = [];
    try {
      const worker = await workerConnection();
      sessions.push(worker);
      const owner = await connectDatabase();
      sessions.push(owner);
      const outsider = await connectDatabase();
      sessions.push(outsider);
      const reducers = owner.connection.reducers;
      const workerReducers = worker.connection.reducers;
      const catalog = await readCatalog();
      const modelId = catalog.models[0].id;
      // Only this isolated test marks a controlled model ready; no NVIDIA request is made.
      catalog.models = catalog.models.map((model) => ({
        ...model,
        ready: true,
        reason: "Controlled isolated integration test",
      }));
      await workerReducers.updateCatalog({ value: catalogToWire(catalog) });
      const manifest = suiteManifestSchema.parse(
        await runPython({ op: "suite_manifest" }),
      );
      await workerReducers.updateSuiteCatalog({
        payload: JSON.stringify(manifest),
      });
      const roomId = `retry-${randomUUID()}`,
        runId = randomUUID();
      const address = { roomId, runId };
      await reducers.createRoom({
        roomId,
        name: "Isolated retry verification",
        label: "Owner",
        requestId: randomUUID(),
      });
      await reducers.startSuite({
        ...address,
        scenarioId: "returns",
        modelId,
        withAi: false,
        baseline: undefined,
        candidate: undefined,
        requestId: randomUUID(),
      });
      const saved = () => {
        const row = [...owner.connection.db.visibleSuiteRuns.iter()].find(
          (item) => item.id === runId,
        );
        return row
          ? scenarioRunSchema.parse(JSON.parse(row.payload))
          : undefined;
      };
      const eventually = async (check: () => boolean) => {
        for (let attempt = 0; attempt < 200; attempt++) {
          if (check()) return;
          await delay(25);
        }
        assert.fail("Expected subscribed state did not arrive.");
      };
      const job = (id: string) =>
        [...worker.connection.db.workerSuiteJobs.iter()].find(
          (item) => item.id === id,
        );
      const claim = async (id: string) => {
        await eventually(() => Boolean(job(id)));
        await workerReducers.claimSuiteJob({ jobId: id });
        await eventually(() => job(id)?.state === "running");
        return job(id)!;
      };
      const compared = await claim(`${runId}:compare`);
      const actualComparison = await runPython({
        op: "suite_compare",
        scenario: "returns",
      });
      await workerReducers.completeSuiteJob({
        jobId: compared.id,
        attempt: compared.attempt,
        payload: JSON.stringify(actualComparison),
        diagnostic: "",
      });
      await eventually(() => saved()?.state === "completed");

      await assert.rejects(
        outsider.connection.reducers.investigateSuite({
          ...address,
          modelId,
          requestId: randomUUID(),
        }),
      );
      await assert.rejects(
        reducers.investigateSuite({
          ...address,
          modelId: "not-ready",
          requestId: randomUUID(),
        }),
      );
      const firstRequest = { ...address, modelId, requestId: randomUUID() };
      await reducers.investigateSuite(firstRequest);
      await eventually(() => saved()?.investigationAttempts?.length === 1);
      const firstId = saved()!.investigationAttempts![0].id;
      const first = await claim(firstId);
      await workerReducers.recordSuiteTrace({
        jobId: first.id,
        attempt: first.attempt,
        event: JSON.stringify({
          id: "orchestrator",
          role: "orchestrator",
          kind: "agent",
          state: "failed",
          label: "Controlled citation failure",
          createdAt: "test-time",
        }),
      });
      const failed = JSON.stringify({
        state: "partial",
        roles: [
          {
            role: "orchestrator",
            state: "failed",
            summary: "Controlled citation failure",
          },
        ],
      });
      await workerReducers.completeSuiteJob({
        jobId: first.id,
        attempt: first.attempt,
        payload: failed,
        diagnostic: "",
      });
      await eventually(() => saved()?.investigationState === "partial");
      const originalTrace = structuredClone(
        saved()!.investigationAttempts![0].trace,
      );

      const requests = [0, 1].map(() => ({
        ...address,
        modelId,
        requestId: randomUUID(),
      }));
      const raced = await Promise.allSettled(
        requests.map((input) => reducers.investigateSuite(input)),
      );
      assert.equal(
        raced.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        raced.filter((result) => result.status === "rejected").length,
        1,
      );
      // Replaying the accepted button request must not schedule another paid job.
      await reducers.investigateSuite(
        requests[raced.findIndex((result) => result.status === "fulfilled")],
      );
      await eventually(() => saved()?.investigationAttempts?.length === 2);
      const secondId = saved()!.investigationAttempts![1].id;
      assert.notEqual(secondId, first.id);
      assert.equal(saved()!.investigationAttempts![0].outcome, failed);
      assert.deepEqual(saved()!.investigationAttempts![0].trace, originalTrace);
      await assert.rejects(
        workerReducers.completeSuiteJob({
          jobId: first.id,
          attempt: first.attempt,
          payload: JSON.stringify({ state: "completed" }),
          diagnostic: "",
        }),
      );
      await assert.rejects(
        workerReducers.recordSuiteTrace({
          jobId: first.id,
          attempt: first.attempt,
          event: JSON.stringify(originalTrace[0]),
        }),
      );
      const second = await claim(secondId);
      await assert.rejects(
        workerReducers.completeSuiteJob({
          jobId: second.id,
          attempt: second.attempt + 1,
          payload: JSON.stringify({ state: "completed" }),
          diagnostic: "",
        }),
      );
      const completed = JSON.stringify({
        state: "completed",
        roles: [],
        summary: "Controlled successful outcome",
      });
      await workerReducers.completeSuiteJob({
        jobId: second.id,
        attempt: second.attempt,
        payload: completed,
        diagnostic: "",
      });
      await eventually(
        () => saved()?.latestSuccessfulInvestigationId === second.id,
      );
      await reducers.investigateSuite({
        ...address,
        modelId,
        requestId: randomUUID(),
      });
      await eventually(() => saved()?.investigationAttempts?.length === 3);
      const third = await claim(saved()!.investigationAttempts![2].id);
      await workerReducers.completeSuiteJob({
        jobId: third.id,
        attempt: third.attempt,
        payload: "",
        diagnostic: "Controlled provider failure",
      });
      await eventually(() => saved()?.investigationState === "failed");
      assert.equal(saved()!.investigation, completed);
      assert.equal(saved()!.latestSuccessfulInvestigationId, second.id);

      const question = {
        ...address,
        modelId,
        question: "Explain the measured mismatch.",
        expectedRevision: 0,
        expectedDecisionVersion: 0,
        requestId: randomUUID(),
        caseId: undefined,
      };
      await assert.rejects(outsider.connection.reducers.askSuite(question));
      await assert.rejects(
        reducers.askSuite({ ...question, expectedRevision: 99 }),
      );
      await reducers.askSuite(question);
      await reducers.askSuite(question);
      await assert.rejects(
        reducers.askSuite({ ...question, requestId: randomUUID() }),
      );
      await eventually(() => saved()?.chat?.length === 1);
      const turn = saved()!.chat![0];
      const chat = await claim(`${runId}:${turn.id}`);
      await workerReducers.completeSuiteJob({
        jobId: chat.id,
        attempt: chat.attempt,
        diagnostic: "",
        payload: JSON.stringify({
          answer:
            "Controlled answer from saved comparison data only. It does not change the reviewed policy or create an approval.",
          requestedModelId: modelId,
          actualModelId: modelId,
          citations: [],
          caseIds: [],
          durationMs: 1,
        }),
      });
      await eventually(() => saved()?.chat?.[0].state === "completed");
      assert.equal(saved()!.revision, 0);
      assert.equal(saved()!.decisionVersion, 0);
      assert.deepEqual(saved()!.decisions, []);

      const draft = {
        ...address,
        expectedRevision: 0,
        expectedDecisionVersion: 0,
        policyId: saved()!.manifest.policies[0].id,
        rationale: "Approve the reviewed fixture policy in an isolated test.",
        evidenceIds: [saved()!.manifest.evidence[0].id],
        requestId: randomUUID(),
      };
      const validationJobs = () =>
        [...worker.connection.db.workerSuiteJobs.iter()].filter(
          (item) => item.runId === runId && item.kind === "validate",
        );

      await t.test(
        "rejected draft approvals leave proposal, decision and jobs unchanged",
        async () => {
          const before = structuredClone(saved());
          await assert.rejects(
            outsider.connection.reducers.approveSuiteDraft(draft),
          );
          await assert.rejects(
            reducers.approveSuiteDraft({
              ...draft,
              expectedRevision: 99,
              requestId: randomUUID(),
            }),
          );
          await assert.rejects(
            reducers.approveSuiteDraft({
              ...draft,
              evidenceIds: ["not-frozen-evidence"],
              requestId: randomUUID(),
            }),
          );
          await assert.rejects(
            reducers.approveSuiteDraft({
              ...draft,
              evidenceIds: [],
              requestId: randomUUID(),
            }),
          );
          assert.deepEqual(saved(), before);
          assert.equal(validationJobs().length, 0);
          assert.equal(
            [...outsider.connection.db.visibleSuiteRuns.iter()].some(
              (row) => row.id === runId,
            ),
            false,
          );
        },
      );

      await t.test(
        "draft approval atomically saves one proposal decision and validation job",
        async () => {
          await reducers.approveSuiteDraft(draft);
          await eventually(
            () =>
              saved()?.decisionVersion === 1 && validationJobs().length === 1,
          );
          const run = saved()!;
          assert.equal(run.revision, 1);
          assert.equal(run.proposals.length, 1);
          assert.equal(run.decisions.length, 1);
          assert.equal(run.reviewState, "decided");
          assert.equal(run.proposals[0].author, owner.identity);
          assert.equal(run.decisions[0].reviewer, owner.identity);
          assert.equal(
            run.decisions[0].proposalRevision,
            run.proposals[0].revision,
          );
          assert.equal(run.decisions[0].policyId, draft.policyId);
          assert.deepEqual(run.decisions[0].evidenceIds, draft.evidenceIds);
          assert.equal(validationJobs()[0].decisionVersion, 1);
          assert.equal(validationJobs()[0].state, "queued");
          const approved = structuredClone(run);
          await reducers.approveSuiteDraft(draft);
          await assert.rejects(
            reducers.approveSuiteDraft({
              ...draft,
              rationale: "Changed request under the same ID",
            }),
          );
          assert.deepEqual(saved(), approved);
          assert.equal(validationJobs().length, 1);
        },
      );

      await t.test(
        "racing draft approvals save exactly one new revision",
        async () => {
          const attempts = [0, 1].map(() => ({
            ...draft,
            expectedRevision: 1,
            expectedDecisionVersion: 1,
            requestId: randomUUID(),
          }));
          const results = await Promise.allSettled(
            attempts.map((input) => reducers.approveSuiteDraft(input)),
          );
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.filter((result) => result.status === "rejected").length,
            1,
          );
          await eventually(
            () =>
              saved()?.decisionVersion === 2 && validationJobs().length === 2,
          );
          assert.equal(saved()!.revision, 2);
          assert.equal(saved()!.proposals.length, 2);
          assert.equal(saved()!.decisions.length, 2);
          assert.deepEqual(
            validationJobs()
              .map((item) => item.decisionVersion)
              .sort(),
            [1, 2],
          );
          const after = structuredClone(saved());
          await assert.rejects(
            reducers.approveSuiteDraft({ ...draft, requestId: randomUUID() }),
          );
          assert.deepEqual(saved(), after);
        },
      );

      await t.test(
        "ticket comments record the authenticated author and deny outsiders",
        async () => {
          const comment = {
            ...address,
            text: "Reviewed the measured boundary case.",
            requestId: randomUUID(),
          };
          const previous = saved()!.comments.length;
          await assert.rejects(
            outsider.connection.reducers.commentSuite(comment),
          );
          assert.equal(saved()!.comments.length, previous);
          await reducers.commentSuite(comment);
          await reducers.commentSuite(comment);
          await eventually(() => saved()!.comments.length === previous + 1);
          const posted = saved()!.comments.at(-1)!;
          assert.equal(posted.author, owner.identity);
          assert.equal(posted.text, comment.text);
          assert.equal(
            [...outsider.connection.db.visibleSuiteRuns.iter()].some(
              (row) => row.id === runId,
            ),
            false,
          );
        },
      );
    } finally {
      for (const session of sessions) session.connection.disconnect();
    }
  },
);
