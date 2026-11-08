/**
 * Save proposals and approvals for the original returns demo.
 * An approval records exactly what was reviewed and schedules its validation.
 */
import { t, SenderError } from "spacetimedb/server";
import db from "./schema";
import { loadRun, request, requireMember, timestamp, text } from "./access";
import {
  approvedCases,
  assertApproval,
} from "../../../../packages/contracts/review";

const address = {
  roomId: t.string(),
  runId: t.string(),
  requestId: t.string(),
};

export const startRun = db.reducer(
  { ...address, candidate: t.string(), modelId: t.string(), withAi: t.bool() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "start", args.requestId, args)) return;
    const room = ctx.db.room.id.find(args.roomId)!;
    const catalog = ctx.db.catalog.id.find("main");
    if (
      !catalog ||
      ctx.timestamp.microsSinceUnixEpoch - catalog.updatedAt > 90_000_000n
    )
      throw new SenderError("Private worker unavailable.");
    const variant = catalog.value.variants.find((v) => v.id === args.candidate);
    if (!variant || !["rewrite-v2", "corrected-v2"].includes(args.candidate))
      throw new SenderError("Unsupported source pair.");
    if (
      args.withAi &&
      !catalog.value.models.find((m) => m.id === args.modelId)?.ready
    )
      throw new SenderError("Selected model has not passed live readiness.");
    if (
      room.runs.length >= 20 ||
      room.runs.some((r) => ["queued", "running"].includes(r.state))
    )
      throw new SenderError(
        "Wait for the active comparison or local room run limit reached.",
      );
    text(args.runId, 100);
    room.runs.push({
      id: args.runId,
      baseline: "legacy-v1",
      candidate: args.candidate,
      modelId: args.withAi ? args.modelId : "deterministic",
      createdAt: timestamp(ctx),
      state: "queued",
      reviewState: "needs_review",
      comparison: undefined,
      evidence: catalog.value.evidence,
      sourceVariants: catalog.value.variants.filter(
        (v) => v.id === args.candidate || v.id === "legacy-v1",
      ),
      proposals: [],
      decisions: [],
      comments: [],
      pins: [],
      activity: [
        {
          id: args.requestId,
          label: args.withAi
            ? "Comparison and investigation queued"
            : "Comparison queued without AI",
          state: "queued",
          createdAt: timestamp(ctx),
        },
      ],
      diagnostic: undefined,
    });
    ctx.db.room.id.update(room);
    ctx.db.job.insert({
      id: `compare:${args.runId}`,
      roomId: args.roomId,
      runId: args.runId,
      kind: "compare",
      decisionVersion: 0,
      candidate: args.candidate,
      candidateHash: variant.sha256,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
      withAi: args.withAi,
    });
  },
);

export const publishProposal = db.reducer(
  {
    ...address,
    expectedRevision: t.u32(),
    choice: t.string(),
    rationale: t.string(),
    evidenceIds: t.array(t.string()),
  },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "proposal", args.requestId, args)) return;
    const { room, run } = loadRun(ctx, args.roomId, args.runId);
    if (!run.comparison?.mismatch_count)
      throw new SenderError("A measured finding is required.");
    if (run.proposals.length !== args.expectedRevision)
      throw new SenderError(
        "This proposal changed. Review the latest revision.",
      );
    if (args.choice !== "include" && args.choice !== "exclude")
      throw new SenderError("Choose an interpretation explicitly.");
    if (
      args.evidenceIds.length !== 2 ||
      !["operations-handbook", "migration-ticket"].every(
        (id) =>
          args.evidenceIds.includes(id) &&
          run.evidence.some((e) => e.id === id && e.sha256.length === 64),
      )
    )
      throw new SenderError(
        "Pin both conflicting policy sources before publishing.",
      );
    if (run.proposals.length >= 50)
      throw new SenderError("Proposal limit reached.");
    run.proposals.push({
      revision: run.proposals.length + 1,
      author: ctx.sender.toHexString(),
      choice: args.choice,
      rationale: text(args.rationale),
      evidenceIds: args.evidenceIds,
      cases: approvedCases(args.choice),
      createdAt: timestamp(ctx),
    });
    run.reviewState = "needs_review";
    run.activity.push({
      id: args.requestId,
      label: `Proposal revision ${run.proposals.length} published`,
      state: "completed",
      createdAt: timestamp(ctx),
    });
    ctx.db.room.id.update(room);
  },
);

/** Save the approval and schedule validation together, after checking this is still the proposal the user reviewed. */
export const approveProposal = db.reducer(
  { ...address, expectedRevision: t.u32(), expectedDecisionVersion: t.u32() },
  (ctx, args) => {
    const member = requireMember(ctx, args.roomId);
    if (request(ctx, "approve", args.requestId, args)) return;
    const { room, run } = loadRun(ctx, args.roomId, args.runId);
    try {
      assertApproval(
        member.role,
        run.proposals.length,
        args.expectedRevision,
        run.decisions.length,
        args.expectedDecisionVersion,
      );
    } catch (error) {
      throw new SenderError(
        error instanceof Error ? error.message : "Approval unavailable.",
      );
    }
    const proposal = run.proposals[run.proposals.length - 1];
    if (!proposal) throw new SenderError("Publish a proposal before approval.");
    if (run.decisions.some((d) => d.proposalRevision === proposal.revision))
      throw new SenderError("This revision already has a decision.");
    const comparisonJob = ctx.db.job.id.find(`compare:${run.id}`);
    if (!comparisonJob || comparisonJob.state !== "completed")
      throw new SenderError("Comparison must finish before approval.");
    const version = run.decisions.length + 1;
    run.decisions.push({
      version,
      proposalRevision: proposal.revision,
      reviewer: ctx.sender.toHexString(),
      createdAt: timestamp(ctx),
      choice: proposal.choice,
      rationale: proposal.rationale,
      cases: proposal.cases,
      validation: {
        state: "queued",
        candidate: run.candidate,
        candidateHash: comparisonJob.candidateHash,
        cases: [],
        diagnostic: undefined,
      },
    });
    run.reviewState = "decided";
    ctx.db.job.insert({
      id: `validate:${run.id}:${version}`,
      roomId: room.id,
      runId: run.id,
      kind: "validate",
      decisionVersion: version,
      candidate: run.candidate,
      candidateHash: comparisonJob.candidateHash,
      state: "queued",
      attempt: 0,
      leaseUntil: 0n,
      withAi: false,
    });
    run.activity.push({
      id: args.requestId,
      label: `Decision ${version} approved; validation queued`,
      state: "queued",
      createdAt: timestamp(ctx),
    });
    ctx.db.room.id.update(room);
  },
);

export const addComment = db.reducer(
  { ...address, text: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "comment", args.requestId, args)) return;
    const { room, run } = loadRun(ctx, args.roomId, args.runId);
    if (run.comments.length >= 200)
      throw new SenderError("Discussion limit reached.");
    run.comments.push({
      id: args.requestId,
      author: ctx.sender.toHexString(),
      text: text(args.text),
      createdAt: timestamp(ctx),
    });
    ctx.db.room.id.update(room);
  },
);
export const pinEvidence = db.reducer(
  { ...address, evidenceId: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "pin", args.requestId, args)) return;
    const { room, run } = loadRun(ctx, args.roomId, args.runId),
      author = ctx.sender.toHexString();
    if (!run.evidence.some((e) => e.id === args.evidenceId))
      throw new SenderError("Evidence unavailable.");
    if (
      !run.pins.some(
        (p) => p.author === author && p.evidenceId === args.evidenceId,
      )
    )
      run.pins.push({ author, evidenceId: args.evidenceId });
    ctx.db.room.id.update(room);
  },
);
export const setReviewState = db.reducer(
  { ...address, state: t.string(), text: t.string() },
  (ctx, args) => {
    requireMember(ctx, args.roomId);
    if (request(ctx, "review-state", args.requestId, args)) return;
    if (!["deferred", "needs_review"].includes(args.state))
      throw new SenderError("Invalid review state.");
    const { room, run } = loadRun(ctx, args.roomId, args.runId);
    run.reviewState = args.state;
    if (args.text)
      run.comments.push({
        id: args.requestId,
        author: ctx.sender.toHexString(),
        text: text(args.text),
        createdAt: timestamp(ctx),
      });
    run.activity.push({
      id: args.requestId,
      label:
        args.state === "deferred"
          ? "Finding deferred; no tests created"
          : "Changes requested",
      state: "completed",
      createdAt: timestamp(ctx),
    });
    ctx.db.room.id.update(room);
  },
);
export const cancelRun = db.reducer(address, (ctx, args) => {
  requireMember(ctx, args.roomId);
  if (request(ctx, "cancel", args.requestId, args)) return;
  const { room, run } = loadRun(ctx, args.roomId, args.runId);
  let running = false;
  for (const job of ctx.db.job.iter())
    if (job.runId === run.id && ["queued", "running"].includes(job.state)) {
      running ||= job.state === "running";
      ctx.db.job.id.update({
        ...job,
        state: job.state === "running" ? "cancelling" : "cancelled",
      });
    }
  run.state = running ? "cancelling" : "cancelled";
  ctx.db.room.id.update(room);
});
