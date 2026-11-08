/** Compares the original returns programs, optionally asks AI for help, and tests approved expectations. */
import { randomUUID } from "node:crypto";
import type { DbConnection } from "../../packages/client/generated";
import type { Job, Room } from "../../packages/client/generated/types";
import {
  comparisonSchema,
  validationResultSchema,
} from "../../packages/contracts/validation";
import {
  comparisonToWire,
  validationToWire,
  roomFromWire,
} from "../../packages/contracts/wire";
import { createNvidiaTransport, investigate } from "../ai/index";
import { artifactsForRun } from "./evidence-config";
import { runPython } from "./runner";
import type {
  Catalog,
  Execution,
  Run,
} from "../../packages/contracts/view-model";

type Investigation = Awaited<ReturnType<typeof investigate>>;
type Activity = Run["activity"][number];

/** Save the whole result in numbered pieces that fit the database limit. Never cut JSON short. */
export function investigationActivity(
  result: Investigation,
  availableRecords: number,
): Activity[] {
  const serialized = JSON.stringify(result);
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length;) {
    let end = Math.min(offset + 1800, serialized.length);
    const last = serialized.charCodeAt(end - 1);
    if (end < serialized.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(serialized.slice(offset, end));
    offset = end;
  }
  if (chunks.length + 1 > availableRecords)
    throw new Error(
      "Investigation outcome exceeds the remaining durable activity capacity.",
    );
  const summary = {
    state: result.state,
    requestedModelId: result.requestedModelId,
    actualModelIds: result.actualModelIds,
    calls: result.calls,
    correctionCalls: result.correctionCalls,
    retries: result.retries,
    toolRequests: result.toolRequests,
    distinctCases: result.distinctCases,
    durationMs: result.durationMs,
    roles: Object.fromEntries(
      Object.entries(result.roles).map(([role, value]) => [role, value.state]),
    ),
  };
  return [
    {
      id: randomUUID(),
      label: `Investigation outcome: ${JSON.stringify(summary)}`,
      state: result.state === "completed" ? "completed" : "failed",
      createdAt: "",
    },
    ...chunks.map((chunk, index) => ({
      id: randomUUID(),
      label: `Investigation JSON ${index + 1}/${chunks.length}\n${chunk}`,
      state: "recorded",
      createdAt: "",
    })),
  ];
}

function execution(value: {
  status: string;
  output?: Execution["output"];
  diagnostic: string | null;
  duration_ms: number;
  sha256: string;
  variant: string;
}): Execution {
  return {
    ...value,
    status: value.status as Execution["status"],
    diagnostic: value.diagnostic ?? undefined,
  };
}

/** Run one assigned job at a time. Slow Python and AI work stays outside database updates. */
export async function executeJob(
  connection: DbConnection,
  job: Job,
  catalog: Catalog,
  signal: AbortSignal,
) {
  const raw = [...connection.db.workerRooms.iter()].find(
    (r) => r.id === job.roomId,
  );
  if (!raw) throw new Error("Worker room snapshot unavailable.");
  const room = roomFromWire(raw as Room),
    run = room.runs.find((r) => r.id === job.runId)!;
  const finish = {
    jobId: job.id,
    attempt: job.attempt,
    candidateHash: job.candidateHash,
  };
  let measured: NonNullable<Run["comparison"]> | undefined;
  try {
    if (
      catalog.variants.find((v) => v.id === job.candidate)?.sha256 !==
      job.candidateHash
    )
      throw new Error("Pinned fixture changed; start a new run.");
    if (job.kind === "compare") {
      const result = comparisonSchema.parse(
        await runPython(
          { op: "compare", baseline: "legacy-v1", candidate: job.candidate },
          signal,
        ),
      );
      const compared: NonNullable<Run["comparison"]> = {
        ...result,
        cases: result.cases.map((c) => ({
          ...c,
          baseline: execution(c.baseline),
          candidate: execution(c.candidate),
        })),
      };
      measured = compared;
      await connection.reducers.recordComparison({
        ...finish,
        comparison: comparisonToWire(compared),
      });
      let diagnostic = "";
      const findingIds = result.cases
        .filter((item) => item.state === "mismatch")
        .map((item) => item.id);
      if (job.withAi && findingIds.length === 0) {
        diagnostic = result.error_count
          ? "Execution errors require investigation; no measured policy difference was available for AI review."
          : "No differences found in the tested cases. AI investigation skipped because there is no measured finding.";
        await connection.reducers.recordActivity({
          jobId: job.id,
          attempt: job.attempt,
          event: {
            id: randomUUID(),
            label: diagnostic,
            state: "completed",
            createdAt: "",
          },
        });
      }
      if (job.withAi && findingIds.length > 0) {
        const artifacts = artifactsForRun(run, [
          ...connection.db.artifactSnapshot.iter(),
        ]);
        let liveEventCount = 0;
        const investigation = await investigate({
          modelId: run.modelId,
          transport: createNvidiaTransport({
            apiKey: process.env.NVIDIA_API_KEY!,
          }),
          context: {
            findingIds,
            artifactIds: artifacts.map((a) => a.id),
            requiredEvidenceIds: ["operations-handbook", "migration-ticket"],
            observations: compared,
          },
          initialCases: result.cases.map((c) => c.input),
          initialCaseResults: result.cases.map((c) => ({
            input: c.input,
            result: c,
          })),
          signal,
          tools: {
            readArtifact: async (id) => {
              const artifact = artifacts.find((a) => a.id === id);
              if (!artifact) throw new Error("Artifact unavailable.");
              return artifact;
            },
            runComparison: async (cases) => {
              const probes = comparisonSchema.parse(
                await runPython(
                  {
                    op: "compare",
                    baseline: "legacy-v1",
                    candidate: job.candidate,
                    cases: cases.map((input, index) => ({
                      id: `probe-${index}-${compared.cases.length}`,
                      input,
                    })),
                  },
                  signal,
                ),
              );
              for (const measured of probes.cases)
                compared.cases.push({
                  ...measured,
                  baseline: execution(measured.baseline),
                  candidate: execution(measured.candidate),
                });
              compared.mismatch_count = compared.cases.filter(
                (c) => c.state === "mismatch",
              ).length;
              compared.error_count = compared.cases.filter(
                (c) => c.state === "error",
              ).length;
              await connection.reducers.recordComparison({
                ...finish,
                comparison: comparisonToWire(compared),
              });
              return probes;
            },
            proposeReview: async () => {
              // Keep the checked suggestion in the final result below.
              // Saving an AI suggestion does not create a human approval.
              return { retainedForOutcome: true, approved: false };
            },
          },
          onEvent: async (event) => {
            // Leave room to save the full result after these short progress updates.
            // The full result still includes every event.
            if (liveEventCount >= 24) return;
            liveEventCount++;
            await connection.reducers.recordActivity({
              jobId: job.id,
              attempt: job.attempt,
              event: {
                id: randomUUID(),
                label: JSON.stringify({
                  role: event.role,
                  state: event.state,
                  tool: event.tool,
                  summary: event.summary.slice(0, 500),
                  durationMs: event.durationMs,
                }),
                state: event.state,
                createdAt: "",
              },
            });
          },
        });
        const currentRoom = [...connection.db.workerRooms.iter()].find(
          (item) => item.id === job.roomId,
        );
        const currentRun = currentRoom?.runs.find(
          (item) => item.id === job.runId,
        );
        const remainingRecords = Math.max(
          0,
          99 -
            (currentRun?.activity.length ??
              run.activity.length + liveEventCount),
        );
        for (const event of investigationActivity(
          investigation,
          remainingRecords,
        )) {
          await connection.reducers.recordActivity({
            jobId: job.id,
            attempt: job.attempt,
            event,
          });
        }
        diagnostic =
          investigation.state === "completed"
            ? ""
            : `AI investigation ${investigation.state}; measured comparison preserved.`;
      }
      await connection.reducers.commitJob({
        ...finish,
        comparison: comparisonToWire(compared),
        validation: undefined,
        diagnostic,
      });
    } else {
      const decision = run.decisions.find(
        (d) => d.version === job.decisionVersion,
      );
      if (!decision) throw new Error("Approved decision not found.");
      const result = validationResultSchema.parse(
        await runPython(
          {
            op: "validate",
            variant: job.candidate,
            approved_cases: decision.cases,
          },
          signal,
        ),
      );
      await connection.reducers.commitJob({
        ...finish,
        comparison: undefined,
        validation: validationToWire({
          state: result.state,
          candidate: job.candidate,
          candidateHash: job.candidateHash,
          cases: result.cases.map((c) => ({
            id: c.id,
            expected: c.expected,
            actual: c.actual ?? undefined,
            state: c.state,
          })),
        }),
        diagnostic: "",
      });
    }
  } catch (error) {
    const diagnostic =
      error instanceof Error ? error.message : "Worker operation failed.";
    await connection.reducers.commitJob({
      ...finish,
      comparison: measured ? comparisonToWire(measured) : undefined,
      validation: undefined,
      diagnostic: diagnostic.slice(0, 500),
    });
  }
}
