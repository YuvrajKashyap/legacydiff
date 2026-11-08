/** Keep earlier AI attempts intact while a person deliberately starts another one. */
import type {
  ScenarioRun,
  InvestigationAttempt,
} from "../../../../packages/contracts/scenarios";

function attemptsFor(run: ScenarioRun) {
  if (!run.investigationAttempts) {
    run.investigationAttempts = [];
    // Older saved runs did not store an attempt list. Preserve their outcome and trace once.
    if (run.investigationState) {
      const legacy: InvestigationAttempt = {
        id: `${run.id}:investigate`,
        modelId: run.modelId ?? "unknown",
        state: run.investigationState,
        trace: (run.aiTrace ?? []).map((item) => ({ ...item })),
        ...(run.investigation ? { outcome: run.investigation } : {}),
        ...(run.diagnostic ? { diagnostic: run.diagnostic } : {}),
      };
      run.investigationAttempts.push(legacy);
      if (legacy.state === "completed")
        run.latestSuccessfulInvestigationId = legacy.id;
    }
  }
  return run.investigationAttempts;
}

export function beginInvestigation(
  run: ScenarioRun,
  modelId: string,
  createdAt: string,
  initial = false,
) {
  if (
    !initial &&
    ["queued", "running", "cancelling"].includes(run.investigationState ?? "")
  )
    throw new Error("An investigation is already active.");
  // The first automatic investigation was requested when the person started the comparison.
  if (initial && !run.investigationAttempts && !run.investigation)
    run.investigationAttempts = [];
  const attempts = attemptsFor(run);
  if (
    attempts.some((item) =>
      ["queued", "running", "cancelling"].includes(item.state),
    )
  )
    throw new Error("An investigation is already active.");
  if (attempts.length >= 10)
    throw new Error("Investigation attempt limit reached (10 per case).");
  const id = `${run.id}:investigate:${attempts.length + 1}`;
  attempts.push({ id, modelId, state: "queued", createdAt, trace: [] });
  run.modelId = modelId;
  run.withAi = true;
  run.investigationState = "queued";
  run.aiTrace = [];
  return id;
}

export function updateInvestigation(
  run: ScenarioRun,
  jobId: string,
  state: InvestigationAttempt["state"],
  details: Pick<
    InvestigationAttempt,
    "outcome" | "diagnostic" | "completedAt"
  > = {},
) {
  const attempts = attemptsFor(run);
  const current = attempts[attempts.length - 1];
  if (!current || current.id !== jobId)
    throw new Error(
      "An older investigation cannot replace the current attempt.",
    );
  current.state = state;
  current.trace = (run.aiTrace ?? []).map((item) => ({ ...item }));
  Object.assign(current, details);
  run.investigationState = state;
  if (
    details.outcome &&
    (state === "completed" || !run.latestSuccessfulInvestigationId)
  )
    run.investigation = details.outcome;
  if (state === "completed") run.latestSuccessfulInvestigationId = current.id;
}
