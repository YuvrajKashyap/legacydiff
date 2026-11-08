/** Runs assigned scenario jobs and asks the database to accept their results. */
import type { DbConnection } from "../../packages/client/generated";
import type { SuiteJob } from "../../packages/client/generated/types";
import {
  scenarioRunSchema,
  suiteComparisonSchema,
  suiteValidationSchema,
} from "../../packages/contracts/scenarios";
import { runPython } from "./runner";
import { investigateSuite } from "../ai/suite-investigation";
import { answerCaseQuestion } from "../ai/case-chat";

export async function executeSuiteJob(
  connection: DbConnection,
  job: SuiteJob,
  signal: AbortSignal,
) {
  const row = [...connection.db.workerSuiteRuns.iter()].find(
    (r) => r.id === job.runId && r.roomId === job.roomId,
  );
  if (!row) throw new Error("Worker scenario snapshot unavailable.");
  // Read the saved run, so later changes to the catalog cannot change this review.
  const run = scenarioRunSchema.parse(JSON.parse(row.payload));
  try {
    let result: unknown;
    if (job.kind === "compare") {
      result = suiteComparisonSchema.parse(
        await runPython(
          {
            op: "suite_compare",
            scenario: run.scenarioId,
            baseline: run.manifest.baseline,
            candidate: run.manifest.candidate,
          },
          signal,
        ),
      );
    } else if (job.kind === "chat") {
      const turn = run.chat?.find((item) => `${run.id}:${item.id}` === job.id);
      if (!turn) throw new Error("Saved chat question unavailable.");
      result = await answerCaseQuestion({
        run,
        turn,
        apiKey: process.env.NVIDIA_API_KEY!,
        signal,
      });
    } else if (job.kind === "investigate") {
      result = await investigateSuite({
        run,
        modelId: run.modelId!,
        apiKey: process.env.NVIDIA_API_KEY!,
        signal,
        onTrace: async (event) => {
          await connection.reducers.recordSuiteTrace({
            jobId: job.id,
            attempt: job.attempt,
            event: JSON.stringify(event),
          });
        },
        onEvent: async (label, state) => {
          await connection.reducers.recordSuiteActivity({
            jobId: job.id,
            attempt: job.attempt,
            label,
            state,
          });
        },
      });
    } else {
      // Test the policy the reviewer approved for this exact decision version.
      const decision = run.decisions.find(
        (d) => d.version === job.decisionVersion,
      );
      const policy = run.manifest.policies.find(
        (p) => p.id === decision?.policyId,
      );
      if (!decision || !policy)
        throw new Error("Approved policy snapshot unavailable.");
      result = suiteValidationSchema.parse(
        await runPython(
          {
            op: "suite_validate",
            candidate: run.manifest.candidate,
            scenario: run.scenarioId,
            policy: policy.id,
            cases: policy.cases,
          },
          signal,
        ),
      );
    }
    // The database accepts this result only if this job attempt still has permission to finish.
    await connection.reducers.completeSuiteJob({
      jobId: job.id,
      attempt: job.attempt,
      payload: JSON.stringify(result),
      diagnostic: "",
    });
  } catch (error) {
    // The database accepts this result only if this job attempt still has permission to finish.
    await connection.reducers.completeSuiteJob({
      jobId: job.id,
      attempt: job.attempt,
      payload: "",
      diagnostic: signal.aborted
        ? "Execution cancelled."
        : error instanceof Error
          ? error.message.slice(0, 1900)
          : "Execution failed.",
    });
  }
}
