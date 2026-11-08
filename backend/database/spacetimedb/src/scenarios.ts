/**
 * Manage comparisons and review decisions for the four scenarios.
 * Save the sources and inputs used for each run, and check permissions here rather than in the UI.
 */
import { SenderError, t } from "spacetimedb/server";
import db, { suiteRun, suiteJob } from "./schema";
import {
  beginInvestigation as beginInvestigationState,
  updateInvestigation as updateInvestigationState,
} from "./investigation-history";
import {
  requireMember,
  requireWorker,
  request,
  text,
  timestamp,
  type Context,
} from "./access";
import {
  suiteManifestSchema,
  scenarioRunSchema,
  aiTraceEventSchema,
  caseChatResponseSchema,
  suiteComparisonSchema,
  suiteValidationSchema,
  type ScenarioRun,
} from "../../../../packages/contracts/scenarios";

// Send normal rule failures back to the caller instead of reporting a database crash.
function beginInvestigation(
  ...args: Parameters<typeof beginInvestigationState>
) {
  try {
    return beginInvestigationState(...args);
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : "Investigation could not start.",
    );
  }
}
function updateInvestigation(
  ...args: Parameters<typeof updateInvestigationState>
) {
  try {
    return updateInvestigationState(...args);
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : "Investigation update rejected.",
    );
  }
}

// JSON object key order is not part of a reviewed input or expected output.
function sameRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const keys = Object.keys(left).sort();
  return (
    JSON.stringify(keys) === JSON.stringify(Object.keys(right).sort()) &&
    keys.every(
      (key) => JSON.stringify(left[key]) === JSON.stringify(right[key]),
    )
  );
}

const address = { roomId: t.string(), runId: t.string() };
function read(ctx: Context, roomId: string, runId: string) {
  const row = ctx.db.suiteRun.id.find(runId);
  if (!row || row.roomId !== roomId)
    throw new SenderError("Comparison unavailable.");
  return scenarioRunSchema.parse(JSON.parse(row.payload));
}
function save(ctx: Context, run: ScenarioRun) {
  const payload = JSON.stringify(scenarioRunSchema.parse(run));
  if (payload.length > 1_500_000)
    throw new SenderError("Local comparison storage limit reached.");
  ctx.db.suiteRun.id.update({ id: run.id, roomId: run.roomId, payload });
}
function event(
  ctx: Context,
  run: ScenarioRun,
  label: string,
  state: "queued" | "working" | "completed" | "failed" | "cancelled",
) {
  if (run.activity.length >= 190)
    throw new SenderError("Local activity limit reached.");
  run.activity.push({
    id: `${run.id}:${run.activity.length}`,
    label,
    state,
    createdAt: timestamp(ctx),
  });
}
/** Show only comparisons in rooms the caller has joined. */
export const visibleSuiteRuns = db.view(
  { name: "visible_suite_runs", public: true },
  t.array(suiteRun.rowType),
  (ctx) => {
    return [...ctx.db.membership.identity.filter(ctx.sender)].flatMap(
      (member) => [...ctx.db.suiteRun.roomId.filter(member.roomId)],
    );
  },
);
export const workerSuiteRuns = db.view(
  { name: "worker_suite_runs", public: true },
  t.array(suiteRun.rowType),
  (ctx) => {
    return ctx.db.configuration.id.find("main")?.worker?.equals(ctx.sender)
      ? [...ctx.db.suiteRun.iter()]
      : [];
  },
);
export const workerSuiteJobs = db.view(
  { name: "worker_suite_jobs", public: true },
  t.array(suiteJob.rowType),
  (ctx) => {
    return ctx.db.configuration.id.find("main")?.worker?.equals(ctx.sender)
      ? [...ctx.db.suiteJob.iter()]
      : [];
  },
);
/** Save the worker’s list of supported scenarios. New runs need a recently updated list. */
export const updateSuiteCatalog = db.reducer(
  { payload: t.string() },
  (ctx, args) => {
    requireWorker(ctx);
    if (args.payload.length > 1_500_000)
      throw new SenderError("Catalog too large.");
    const payload = JSON.stringify(
      suiteManifestSchema.parse(JSON.parse(args.payload)),
    );
    const row = {
      id: "main",
      payload,
      updatedAt: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (ctx.db.suiteCatalog.id.find("main")) ctx.db.suiteCatalog.id.update(row);
    else ctx.db.suiteCatalog.insert(row);
  },
);
/** Save a copy of the chosen inputs and evidence, then schedule the comparison. There are no results yet. */
export const startSuite = db.reducer(
  {
    ...address,
    scenarioId: t.string(),
    baseline: t.option(t.string()),
    candidate: t.option(t.string()),
    modelId: t.string(),
    withAi: t.bool(),
    requestId: t.string(),
  },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-start", args.requestId, args)) return;
    text(args.runId, 100);
    if ([...ctx.db.suiteRun.roomId.filter(args.roomId)].length >= 20)
      throw new SenderError("Local room run limit reached.");
    const catalog = ctx.db.suiteCatalog.id.find("main");
    if (
      !catalog ||
      ctx.timestamp.microsSinceUnixEpoch - catalog.updatedAt > 90_000_000n
    )
      throw new SenderError("Wait for the current private worker catalog.");
    const manifest = suiteManifestSchema
      .parse(JSON.parse(catalog.payload))
      .scenarios.find((item) => item.id === args.scenarioId);
    if (!manifest) throw new SenderError("Unsupported bundled scenario.");
    // Only reviewed bundled files can be selected. Save this pair with the run.
    const baseline = args.baseline ?? manifest.baseline;
    const candidate = args.candidate ?? manifest.candidate;
    if (
      baseline === candidate ||
      ![baseline, candidate].every((id) =>
        manifest.variants.some((variant) => variant.id === id),
      )
    ) {
      throw new SenderError("Choose two different reviewed source versions.");
    }
    manifest.baseline = baseline;
    manifest.candidate = candidate;

    if (
      args.withAi &&
      !ctx.db.catalog.id
        .find("main")
        ?.value.models.some((m) => m.id === args.modelId && m.ready)
    )
      throw new SenderError(
        "Selected model has not passed its live readiness check.",
      );
    // Keep the chosen data with this run so later fixture edits cannot change its meaning.
    const run: ScenarioRun = {
      modelId: args.modelId,
      withAi: args.withAi,
      id: args.runId,
      roomId: args.roomId,
      scenarioId: manifest.id,
      createdAt: timestamp(ctx),
      state: "queued",
      reviewState: "needs_review",
      revision: 0,
      decisionVersion: 0,
      evidenceIds: [],
      proposals: [],
      decisions: [],
      comments: [],
      activity: [],
      manifest,
    };
    event(
      ctx,
      run,
      `Queued ${manifest.dataset.count} synthetic inputs. No results yet.`,
      "queued",
    );
    ctx.db.suiteRun.insert({
      id: run.id,
      roomId: run.roomId,
      payload: JSON.stringify(run),
    });
    ctx.db.suiteJob.insert({
      id: `${run.id}:compare`,
      roomId: run.roomId,
      runId: run.id,
      kind: "compare",
      decisionVersion: 0,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
    });
  },
);
/** Save the proposal only if nobody changed the review since the user opened it. */
export const publishSuiteProposal = db.reducer(
  {
    ...address,
    expectedRevision: t.u32(),
    expectedDecisionVersion: t.u32(),
    policyId: t.string(),
    rationale: t.string(),
    evidenceIds: t.array(t.string()),
    requestId: t.string(),
  },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-proposal", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (!run.comparison || run.state !== "completed")
      throw new SenderError("Wait for actual corpus outputs.");
    if (
      run.revision !== args.expectedRevision ||
      run.decisionVersion !== args.expectedDecisionVersion
    )
      throw new SenderError(
        "This proposal changed. Review the latest revision.",
      );
    if (run.revision >= 50)
      throw new SenderError("Local revision limit reached.");
    const policy = run.manifest.policies.find((p) => p.id === args.policyId);
    if (
      !policy ||
      (run.manifest.policies.some((p) => p.security_required) &&
        !policy.security_required)
    )
      throw new SenderError(
        "Independent security requirements cannot be waived for parity.",
      );
    const evidenceIds = [...new Set(args.evidenceIds)];
    if (
      !evidenceIds.length ||
      evidenceIds.some((id) => !run.manifest.evidence.some((e) => e.id === id))
    )
      throw new SenderError("Pin evidence from this frozen run.");
    run.revision++;
    run.policyId = policy.id;
    run.rationale = text(args.rationale, 2000);
    run.evidenceIds = evidenceIds;
    run.reviewState = "needs_review";
    run.proposals.push({
      revision: run.revision,
      policyId: policy.id,
      rationale: run.rationale,
      evidenceIds,
      author: ctx.sender.toHexString(),
      createdAt: timestamp(ctx),
    });
    save(ctx, run);
  },
);
/** Approve the explicitly selected saved version without a separate publish step. */
export const approveSuiteDraft = db.reducer(
  {
    ...address,
    expectedRevision: t.u32(),
    expectedDecisionVersion: t.u32(),
    policyId: t.string(),
    rationale: t.string(),
    evidenceIds: t.array(t.string()),
    requestId: t.string(),
  },
  (ctx, args) => {
    const member = requireMember(ctx, args.roomId);
    if (member.role !== "reviewer")
      throw new SenderError("Reviewer authorization required.");
    if (request(ctx, "suite-approve-draft", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (!run.comparison || run.state !== "completed")
      throw new SenderError("Wait for actual corpus outputs.");
    if (
      run.revision !== args.expectedRevision ||
      run.decisionVersion !== args.expectedDecisionVersion
    )
      throw new SenderError(
        "This proposal changed. Review the latest revision.",
      );
    if (run.revision >= 50 || run.decisionVersion >= 50)
      throw new SenderError("Local revision limit reached.");
    const policy = run.manifest.policies.find((p) => p.id === args.policyId);
    if (
      !policy ||
      (run.manifest.policies.some((p) => p.security_required) &&
        !policy.security_required)
    )
      throw new SenderError(
        "Independent security requirements cannot be waived for parity.",
      );
    const evidenceIds = [...new Set(args.evidenceIds)];
    if (
      !evidenceIds.length ||
      evidenceIds.some((id) => !run.manifest.evidence.some((e) => e.id === id))
    )
      throw new SenderError("Pin evidence from this frozen run.");
    run.revision++;
    run.policyId = policy.id;
    run.rationale = text(args.rationale, 2000);
    run.evidenceIds = evidenceIds;
    run.reviewState = "needs_review";
    run.proposals.push({
      revision: run.revision,
      policyId: policy.id,
      rationale: run.rationale,
      evidenceIds,
      author: ctx.sender.toHexString(),
      createdAt: timestamp(ctx),
    });
    // Save the selected version's exact policy and approval in one transaction.
    // A stale review or failed validation setup leaves neither a proposal nor an approval.
    run.decisionVersion++;
    run.decisions.push({
      version: run.decisionVersion,
      proposalRevision: run.revision,
      policyId: policy.id,
      rationale: run.rationale,
      evidenceIds: [...evidenceIds],
      reviewer: ctx.sender.toHexString(),
      createdAt: timestamp(ctx),
    });
    run.reviewState = "decided";
    ctx.db.suiteJob.insert({
      id: `${run.id}:validate:${run.decisionVersion}`,
      roomId: run.roomId,
      runId: run.id,
      kind: "validate",
      decisionVersion: run.decisionVersion,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
    });
    event(
      ctx,
      run,
      `Decision ${run.decisionVersion} approved for ${run.id}; validation queued.`,
      "queued",
    );
    save(ctx, run);
  },
);
/** Save the approved proposal and schedule its validation together. Both changes succeed or neither does. */
export const approveSuiteProposal = db.reducer(
  {
    ...address,
    expectedRevision: t.u32(),
    expectedDecisionVersion: t.u32(),
    requestId: t.string(),
  },
  (ctx, args) => {
    const member = requireMember(ctx, args.roomId);
    if (member.role !== "reviewer")
      throw new SenderError("Reviewer authorization required.");
    if (request(ctx, "suite-approve", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (
      run.revision !== args.expectedRevision ||
      run.decisionVersion !== args.expectedDecisionVersion
    )
      throw new SenderError(
        "This proposal changed. Review the latest revision.",
      );
    // Approval always refers to a published proposal, never an unsaved browser draft.
    const proposal = run.proposals[run.proposals.length - 1];
    if (
      !proposal ||
      run.decisions.some((d) => d.proposalRevision === proposal.revision)
    )
      throw new SenderError("Publish a new proposal revision before approval.");
    if (run.decisionVersion >= 50)
      throw new SenderError("Local decision limit reached.");
    run.decisionVersion++;
    run.decisions.push({
      version: run.decisionVersion,
      proposalRevision: proposal.revision,
      policyId: proposal.policyId,
      rationale: proposal.rationale,
      evidenceIds: [...proposal.evidenceIds],
      reviewer: ctx.sender.toHexString(),
      createdAt: timestamp(ctx),
    });
    run.reviewState = "decided";
    ctx.db.suiteJob.insert({
      id: `${run.id}:validate:${run.decisionVersion}`,
      roomId: run.roomId,
      runId: run.id,
      kind: "validate",
      decisionVersion: run.decisionVersion,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
    });
    event(
      ctx,
      run,
      `Decision ${run.decisionVersion} approved at proposal ${proposal.revision}; validation queued.`,
      "queued",
    );
    save(ctx, run);
  },
);
export const commentSuite = db.reducer(
  { ...address, text: t.string(), requestId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-comment", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (run.comments.length >= 200)
      throw new SenderError("Local comment limit reached.");
    run.comments.push({
      id: args.requestId,
      author: ctx.sender.toHexString(),
      text: text(args.text, 2000),
      createdAt: timestamp(ctx),
    });
    save(ctx, run);
  },
);
export const deferSuite = db.reducer(
  { ...address, requestId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-defer", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    run.reviewState = "deferred";
    save(ctx, run);
  },
);
/** Ask running work to stop. Do not call it cancelled until cleanup finishes or its allowed time expires. */
/** Bring a parked comparison back for a human decision without changing its measured results. */
export const resumeSuite = db.reducer(
  { ...address, requestId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-resume", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (run.reviewState !== "deferred")
      throw new SenderError("Only a deferred comparison can return to review.");
    if (run.decisions.length)
      throw new SenderError(
        "Publish a new proposal to review an already approved decision.",
      );
    run.reviewState = "needs_review";
    event(
      ctx,
      run,
      "Returned to review. Saved execution results are unchanged.",
      "completed",
    );
    save(ctx, run);
  },
);

/** Investigate saved results without rerunning code or approving a policy. */
export const investigateSuite = db.reducer(
  { ...address, modelId: t.string(), requestId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-investigate", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (!run.comparison || run.state !== "completed")
      throw new SenderError("Wait for measured comparison results first.");
    if (
      [...ctx.db.suiteJob.iter()].some(
        (job) =>
          job.runId === run.id &&
          job.kind === "investigate" &&
          ["queued", "running", "cancelling"].includes(job.state),
      )
    )
      throw new SenderError(
        "An investigation is already active for this case.",
      );
    const catalog = ctx.db.catalog.id.find("main");
    if (
      !catalog ||
      ctx.timestamp.microsSinceUnixEpoch - catalog.updatedAt > 90_000_000n ||
      !catalog.value.models.some(
        (model) => model.id === args.modelId && model.ready,
      )
    )
      throw new SenderError("Choose a currently ready model.");
    const jobId = beginInvestigation(run, args.modelId, timestamp(ctx));
    ctx.db.suiteJob.insert({
      id: jobId,
      roomId: run.roomId,
      runId: run.id,
      kind: "investigate",
      decisionVersion: 0,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
    });
    event(
      ctx,
      run,
      "AI team queued to investigate these saved results. No approval is created.",
      "queued",
    );
    save(ctx, run);
  },
);

/** Save the question and the review version it refers to before asking the worker. */
export const askSuite = db.reducer(
  {
    ...address,
    modelId: t.string(),
    question: t.string(),
    expectedRevision: t.u32(),
    expectedDecisionVersion: t.u32(),
    requestId: t.string(),
    caseId: t.option(t.string()),
  },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-chat", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    if (!run.comparison || run.state !== "completed")
      throw new SenderError(
        "Wait for measured results before asking about this case.",
      );
    if (
      run.revision !== args.expectedRevision ||
      run.decisionVersion !== args.expectedDecisionVersion
    )
      throw new SenderError(
        "This review changed. Read the latest version before asking.",
      );
    const catalog = ctx.db.catalog.id.find("main");
    if (
      !catalog ||
      ctx.timestamp.microsSinceUnixEpoch - catalog.updatedAt > 90_000_000n ||
      !catalog.value.models.some(
        (model) => model.id === args.modelId && model.ready,
      )
    )
      throw new SenderError("Choose a currently ready model.");
    const turns = run.chat ?? [];
    if (turns.length >= 20)
      throw new SenderError("This case has reached its 20-question limit.");
    if (turns.some((turn) => ["queued", "running"].includes(turn.state)))
      throw new SenderError(
        "Wait for the current answer before asking another question.",
      );
    if (
      args.caseId &&
      !run.comparison.cases.some((item) => item.id === args.caseId)
    )
      throw new SenderError("The selected measured case is unavailable.");
    // Include the selected case first, then differences and errors, then controls.
    const measured = [...run.comparison.cases].sort(
      (left, right) =>
        Number(right.id === args.caseId) - Number(left.id === args.caseId) ||
        Number(right.state !== "match") - Number(left.state !== "match"),
    );
    const id = `chat-${turns.length + 1}`;
    // Keep the public specialist findings that existed when the question was asked.
    const specialistSummaries: NonNullable<
      NonNullable<ScenarioRun["chat"]>[number]["context"]["specialistSummaries"]
    > = [];
    if (run.investigation) {
      const saved = JSON.parse(run.investigation);
      for (const entry of Array.isArray(saved.roles)
        ? saved.roles.slice(0, 4)
        : []) {
        if (
          ["orchestrator", "behavior", "policy", "regression"].includes(
            entry.role,
          ) &&
          ["completed", "failed"].includes(entry.state) &&
          typeof entry.summary === "string"
        )
          specialistSummaries.push({
            role: entry.role,
            state: entry.state,
            summary: entry.summary.slice(0, 1500),
          });
      }
    }
    turns.push({
      id,
      requestId: args.requestId,
      author: ctx.sender.toHexString(),
      question: text(args.question, 2000),
      state: "queued",
      requestedModelId: args.modelId,
      createdAt: timestamp(ctx),
      context: {
        specialistSummaries,
        revision: run.revision,
        decisionVersion: run.decisionVersion,
        caseIds: measured.slice(0, 20).map((item) => item.id),
        priorTurnIds: turns
          .filter((turn) => turn.state === "completed")
          .slice(-6)
          .map((turn) => turn.id),
        datasetHash: run.manifest.dataset.sha256,
        candidateHash: run.manifest.variants.find(
          (variant) => variant.id === run.manifest.candidate,
        )!.sha256,
      },
    });
    run.chat = turns;
    ctx.db.suiteJob.insert({
      id: `${run.id}:${id}`,
      roomId: run.roomId,
      runId: run.id,
      kind: "chat",
      decisionVersion: run.decisionVersion,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
    });
    save(ctx, run);
  },
);

/** Store only real events from the worker currently allowed to finish this AI job. */
export const recordSuiteTrace = db.reducer(
  { jobId: t.string(), attempt: t.u32(), event: t.string() },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.suiteJob.id.find(args.jobId);
    if (
      !job ||
      job.kind !== "investigate" ||
      job.state !== "running" ||
      job.attempt !== args.attempt ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Stale AI event.");
    if (args.event.length > 6000) throw new SenderError("AI event too large.");
    const entry = aiTraceEventSchema.parse(JSON.parse(args.event));
    const run = read(ctx, job.roomId, job.runId);
    const events = run.aiTrace ?? [];
    const existing = events.findIndex((item) => item.id === entry.id);
    // Keep the first server timestamp when a running event receives its result.
    entry.createdAt =
      existing >= 0 ? events[existing].createdAt : timestamp(ctx);
    if (existing >= 0) events[existing] = entry;
    else {
      if (events.length >= 100)
        throw new SenderError("AI event limit reached.");
      events.push(entry);
    }
    run.aiTrace = events;
    updateInvestigation(run, job.id, "running");
    save(ctx, run);
  },
);

export const cancelSuite = db.reducer(
  { ...address, requestId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "suite-cancel", args.requestId, args)) return;
    const run = read(ctx, args.roomId, args.runId);
    for (const job of ctx.db.suiteJob.iter()) {
      if (job.runId !== run.id || !["queued", "running"].includes(job.state))
        continue;
      ctx.db.suiteJob.id.update({
        ...job,
        state: job.state === "queued" ? "cancelled" : "cancelling",
      });
      if (job.kind === "compare")
        run.state = job.state === "queued" ? "cancelled" : "cancelling";
      if (job.kind === "investigate")
        updateInvestigation(
          run,
          job.id,
          job.state === "queued" ? "cancelled" : "cancelling",
          job.state === "queued" ? { completedAt: timestamp(ctx) } : {},
        );
      if (job.kind === "chat" && job.state === "queued") {
        const turn = run.chat?.find(
          (item) => `${run.id}:${item.id}` === job.id,
        );
        if (turn) {
          turn.state = "cancelled";
          turn.completedAt = timestamp(ctx);
        }
      }
    }
    save(ctx, run);
  },
);
/** Give the worker a limited time to finish this attempt. Never automatically repeat an uncertain AI request. */
export const claimSuiteJob = db.reducer({ jobId: t.string() }, (ctx, args) => {
  requireWorker(ctx);
  const job = ctx.db.suiteJob.id.find(args.jobId);
  if (
    !job ||
    !(
      job.state === "queued" ||
      (job.state === "running" &&
        !["investigate", "chat"].includes(job.kind) &&
        job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch &&
        job.attempt < 3)
    )
  )
    throw new SenderError("Job not claimable.");
  ctx.db.suiteJob.id.update({
    ...job,
    state: "running",
    attempt: job.attempt + 1,
    leaseUntil:
      ctx.timestamp.microsSinceUnixEpoch +
      (job.kind === "investigate"
        ? 420_000_000n
        : job.kind === "chat"
          ? 120_000_000n
          : 60_000_000n),
  });
  if (job.kind === "compare" || job.kind === "investigate") {
    const run = read(ctx, job.roomId, job.runId);
    if (job.kind === "compare") run.state = "running";
    else updateInvestigation(run, job.id, "running");
    save(ctx, run);
  }
  if (job.kind === "chat") {
    const run = read(ctx, job.roomId, job.runId);
    const turn = run.chat?.find((item) => `${run.id}:${item.id}` === job.id);
    if (!turn || turn.state !== "queued")
      throw new SenderError("Chat question unavailable.");
    turn.state = "running";
    save(ctx, run);
  }
});
/** Accept results only from the current, unexpired attempt. Check they belong to this run’s saved sources, inputs and expectations. */
export const completeSuiteJob = db.reducer(
  {
    jobId: t.string(),
    attempt: t.u32(),
    payload: t.string(),
    diagnostic: t.string(),
  },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.suiteJob.id.find(args.jobId);
    if (
      !job ||
      !["running", "cancelling"].includes(job.state) ||
      job.attempt !== args.attempt ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Stale worker result.");
    const run = read(ctx, job.roomId, job.runId);
    // A chat reply belongs to its saved question, even if the review changed meanwhile.
    if (job.kind === "chat") {
      const turn = run.chat?.find((item) => `${run.id}:${item.id}` === job.id);
      if (!turn || turn.state !== "running")
        throw new SenderError("Chat question unavailable.");
      if (job.state === "cancelling") {
        turn.state = "cancelled";
        ctx.db.suiteJob.id.update({ ...job, state: "cancelled" });
      } else if (args.diagnostic) {
        turn.state = "failed";
        turn.error = text(args.diagnostic, 2000);
        ctx.db.suiteJob.id.update({ ...job, state: "error" });
      } else {
        if (args.payload.length > 30000)
          throw new SenderError("Chat reply too large.");
        const response = caseChatResponseSchema.parse(JSON.parse(args.payload));
        if (
          response.requestedModelId !== turn.requestedModelId ||
          response.actualModelId !== turn.requestedModelId ||
          response.caseIds.some((id) => !turn.context.caseIds.includes(id))
        )
          throw new SenderError("Chat reply does not match its saved context.");
        for (const citation of response.citations) {
          const artifact = [
            ...run.manifest.variants,
            ...run.manifest.evidence,
          ].find((item) => item.id === citation.artifact_id);
          const lines = artifact?.source.split("\n");
          if (
            !lines ||
            citation.end_line < citation.start_line ||
            citation.end_line > lines.length ||
            !lines
              .slice(citation.start_line - 1, citation.end_line)
              .join("\n")
              .includes(citation.quote)
          )
            throw new SenderError(
              "Chat quote does not match the saved source.",
            );
        }
        turn.response = response;
        turn.state = "completed";
        ctx.db.suiteJob.id.update({ ...job, state: "completed" });
      }
      turn.completedAt = timestamp(ctx);
      save(ctx, run);
      return;
    }
    if (job.state === "cancelling") {
      if (job.kind === "compare") run.state = "cancelled";
      if (job.kind === "investigate")
        updateInvestigation(run, job.id, "cancelled", {
          completedAt: timestamp(ctx),
        });
      ctx.db.suiteJob.id.update({ ...job, state: "cancelled" });
      event(
        ctx,
        run,
        "Execution cancelled; no success is inferred.",
        "cancelled",
      );
    } else if (args.diagnostic) {
      run.diagnostic = text(args.diagnostic, 2000);
      if (job.kind === "compare") run.state = "error";
      if (job.kind === "investigate")
        updateInvestigation(run, job.id, "failed", {
          diagnostic: run.diagnostic,
          completedAt: timestamp(ctx),
        });
      ctx.db.suiteJob.id.update({ ...job, state: "error" });
      event(ctx, run, run.diagnostic, "failed");
    } else {
      if (args.payload.length > 1_000_000)
        throw new SenderError("Worker result too large.");
      // AI suggestions are saved separately. They do not approve a policy or replace measured outputs.
      if (job.kind === "investigate") {
        if (args.payload.length > 100000)
          throw new SenderError("Investigation exceeds storage limit.");
        const outcome = JSON.parse(args.payload);
        if (!["completed", "partial", "failed"].includes(outcome.state))
          throw new SenderError("Invalid AI outcome.");
        updateInvestigation(run, job.id, outcome.state, {
          outcome: args.payload,
          completedAt: timestamp(ctx),
        });
        event(
          ctx,
          run,
          "AI investigation finished. Suggestions are not approvals.",
          "completed",
        );
      } else if (job.kind === "compare") {
        const result = suiteComparisonSchema.parse(JSON.parse(args.payload));
        if (
          result.scenario !== run.scenarioId ||
          result.dataset_hash !== run.manifest.dataset.sha256 ||
          result.cases.length !== run.manifest.dataset.count
        )
          throw new SenderError("Corpus snapshot changed.");
        for (const item of result.cases) {
          const input = run.manifest.dataset.cases.find(
            (c) => c.id === item.id,
          );
          if (!input || !sameRecord(input.input, item.input))
            throw new SenderError("Measured input differs from corpus.");
          for (const side of ["baseline", "candidate"] as const) {
            const variant = run.manifest.variants.find(
              (v) => v.id === run.manifest[side],
            );
            if (
              item[side].variant !== variant?.id ||
              item[side].sha256 !== variant.sha256
            )
              throw new SenderError("Measured source differs from snapshot.");
          }
        }
        run.comparison = result;
        if (run.withAi) {
          const investigationJobId = beginInvestigation(
            run,
            run.modelId!,
            timestamp(ctx),
            true,
          );
          ctx.db.suiteJob.insert({
            id: investigationJobId,
            roomId: run.roomId,
            runId: run.id,
            kind: "investigate",
            decisionVersion: 0,
            state: "queued",
            attempt: 0,
            leaseUntil: 0n,
          });
        }
        run.state = "completed";
        event(
          ctx,
          run,
          `${result.cases.length} inputs executed; ${result.mismatch_count} differences, ${result.error_count} errors.`,
          "completed",
        );
      } else {
        const result = suiteValidationSchema.parse(JSON.parse(args.payload));
        const decision = run.decisions.find(
          (d) => d.version === job.decisionVersion,
        );
        const policy = run.manifest.policies.find(
          (p) => p.id === decision?.policyId,
        );
        if (
          !decision ||
          !policy ||
          result.candidateHash !==
            run.manifest.variants.find((v) => v.id === run.manifest.candidate)
              ?.sha256 ||
          result.cases.length !== policy.cases.length
        )
          throw new SenderError("Validation snapshot changed.");
        for (const item of result.cases) {
          const approved = policy.cases.find((c) => c.id === item.id);
          if (!approved || !sameRecord(approved.expected, item.expected))
            throw new SenderError(
              "Validation expectations differ from approval.",
            );
        }
        // Attach the result to the decision that requested it, even if a newer decision now exists.
        decision.validation = result;
        event(
          ctx,
          run,
          `Decision ${decision.version} validation ${result.state}. Independent requirements remain binding.`,
          "completed",
        );
      }
      ctx.db.suiteJob.id.update({ ...job, state: "completed" });
    }
    save(ctx, run);
  },
);

export const recordSuiteActivity = db.reducer(
  { jobId: t.string(), attempt: t.u32(), label: t.string(), state: t.string() },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.suiteJob.id.find(args.jobId);
    if (
      !job ||
      job.state !== "running" ||
      job.attempt !== args.attempt ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Stale activity.");
    const run = read(ctx, job.roomId, job.runId);
    event(
      ctx,
      run,
      text(args.label, 2000),
      args.state === "failed"
        ? "failed"
        : args.state === "working"
          ? "working"
          : "completed",
    );
    save(ctx, run);
  },
);
/** Mark abandoned work as cancelled or failed. Missing results never count as success. */
export const recoverSuiteJobs = db.reducer((ctx) => {
  requireWorker(ctx);
  for (const job of ctx.db.suiteJob.iter()) {
    if (
      !["running", "cancelling"].includes(job.state) ||
      job.leaseUntil >= ctx.timestamp.microsSinceUnixEpoch
    )
      continue;
    if (
      job.state === "running" &&
      job.attempt < 3 &&
      !["investigate", "chat"].includes(job.kind)
    )
      continue;
    const run = read(ctx, job.roomId, job.runId);
    const cancelled = job.state === "cancelling";
    ctx.db.suiteJob.id.update({
      ...job,
      state: cancelled ? "cancelled" : "error",
    });
    if (job.kind === "compare") run.state = cancelled ? "cancelled" : "error";
    if (job.kind === "investigate")
      updateInvestigation(run, job.id, cancelled ? "cancelled" : "failed", {
        completedAt: timestamp(ctx),
        diagnostic:
          "Worker stopped before a result was saved. Paid requests are not repeated automatically.",
      });
    if (job.kind === "chat") {
      const turn = run.chat?.find((item) => `${run.id}:${item.id}` === job.id);
      if (turn) {
        turn.state = cancelled ? "cancelled" : "failed";
        turn.error =
          "Worker stopped before the answer was saved. This paid request will not be repeated automatically.";
        turn.completedAt = timestamp(ctx);
      }
      save(ctx, run);
      continue;
    }
    run.diagnostic = cancelled
      ? "Cancelled execution released after worker loss."
      : "Worker lease expired; no successful result is inferred.";
    event(ctx, run, run.diagnostic, cancelled ? "cancelled" : "failed");
    save(ctx, run);
  }
});
