import { t, SenderError } from "spacetimedb/server";
import db, {
  job,
  room,
  catalogType,
  comparisonType,
  validationType,
  activityType,
  artifactType,
} from "./schema";
import { requireWorker, loadRun, timestamp } from "./access";
import type { Infer } from "spacetimedb";
import {
  returnInputSchema,
  returnOutputSchema,
} from "../../../packages/contracts/validation";

function checkComparison(
  run: ReturnType<typeof loadRun>["run"],
  comparison: Infer<typeof comparisonType>,
  candidateHash: string,
) {
  const baseline = run.sourceVariants.find((v) => v.id === "legacy-v1");
  if (
    comparison.cases.length < 1 ||
    comparison.cases.length > 20 ||
    new Set(comparison.cases.map((c) => c.id)).size !== comparison.cases.length
  )
    throw new SenderError("Invalid measured case scope.");
  for (const c of comparison.cases) {
    returnInputSchema.parse(c.input);
    if (
      c.baseline.variant !== "legacy-v1" ||
      c.baseline.sha256 !== baseline?.sha256 ||
      c.candidate.variant !== run.candidate ||
      c.candidate.sha256 !== candidateHash
    )
      throw new SenderError("Measured source snapshot mismatch.");
    for (const execution of [c.baseline, c.candidate]) {
      if (
        !["success", "error", "timeout", "cancelled"].includes(
          execution.status,
        ) ||
        execution.duration_ms < 0 ||
        !Number.isFinite(execution.duration_ms)
      )
        throw new SenderError("Invalid execution status.");
      if (execution.status === "success")
        returnOutputSchema.parse(execution.output);
      else if (execution.output)
        throw new SenderError("Failed execution cannot have business output.");
    }
    const success =
      c.baseline.status === "success" && c.candidate.status === "success";
    const keys = ["eligible", "refund_cents", "reason"] as const;
    const differences = success
      ? keys.filter(
          (key) => c.baseline.output![key] !== c.candidate.output![key],
        )
      : [];
    const state = success
      ? differences.length
        ? "mismatch"
        : "match"
      : "error";
    if (
      c.state !== state ||
      differences.length !== c.differences.length ||
      !differences.every((key) => c.differences.includes(key))
    )
      throw new SenderError("Comparison does not match its measured outputs.");
  }
  if (
    comparison.mismatch_count !==
      comparison.cases.filter((c) => c.state === "mismatch").length ||
    comparison.error_count !==
      comparison.cases.filter((c) => c.state === "error").length
  )
    throw new SenderError("Incorrect comparison counts.");
}

export const initialize = db.init((ctx) => {
  ctx.db.configuration.insert({
    id: "main",
    owner: ctx.sender,
    worker: undefined,
  });
});
export const setWorker = db.reducer({ identity: t.identity() }, (ctx, args) => {
  const config = ctx.db.configuration.id.find("main")!;
  if (!config.owner.equals(ctx.sender))
    throw new SenderError(
      "Only the database owner can configure the private worker.",
    );
  ctx.db.configuration.id.update({ ...config, worker: args.identity });
});
export const updateCatalog = db.reducer({ value: catalogType }, (ctx, args) => {
  requireWorker(ctx);
  if (
    args.value.variants.length !== 3 ||
    args.value.evidence.length !== 2 ||
    args.value.models.length !== 3
  )
    throw new SenderError("Unsupported catalog.");
  const row = {
    id: "main",
    value: args.value,
    updatedAt: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (ctx.db.catalog.id.find("main")) ctx.db.catalog.id.update(row);
  else ctx.db.catalog.insert(row);
});

export const recordArtifact = db.reducer(
  { value: artifactType },
  (ctx, { value }) => {
    requireWorker(ctx);
    if (
      ![
        "legacy-v1",
        "rewrite-v2",
        "corrected-v2",
        "operations-handbook",
        "migration-ticket",
      ].includes(value.id) ||
      value.repository !== "YuvrajKashyap/legacydiff" ||
      !/^fixtures\/returns\/[a-zA-Z0-9_-]+\.(py|md)$/.test(value.path) ||
      value.text.length > 49152 ||
      value.sourceBytesBase64.length > 65536 ||
      !/^([a-f0-9]{64})$/.test(value.sha256)
    )
      throw new SenderError("Unsupported artifact snapshot.");
    if (!["Live", "Cached", "Local fixture"].includes(value.source))
      throw new SenderError("Invalid artifact provenance.");
    if (
      value.source !== "Local fixture" &&
      (!value.commit ||
        !/^[a-f0-9]{40}$/.test(value.commit) ||
        !value.gitBlobSha)
    )
      throw new SenderError("Pinned GitHub provenance required.");
    const key = `${value.id}:${value.sha256}:${value.commit ?? "local"}`;
    if (!ctx.db.artifactSnapshot.key.find(key))
      ctx.db.artifactSnapshot.insert({ key, value });
  },
);
export const workerJobs = db.view(
  { name: "worker_jobs", public: true },
  t.array(job.rowType),
  (ctx) =>
    ctx.db.configuration.id.find("main")?.worker?.equals(ctx.sender)
      ? [...ctx.db.job.iter()]
      : [],
);
export const workerRooms = db.view(
  { name: "worker_rooms", public: true },
  t.array(room.rowType),
  (ctx) =>
    ctx.db.configuration.id.find("main")?.worker?.equals(ctx.sender)
      ? [...ctx.db.room.iter()]
      : [],
);

export const claimJob = db.reducer({ jobId: t.string() }, (ctx, args) => {
  requireWorker(ctx);
  const job = ctx.db.job.id.find(args.jobId);
  if (
    !job ||
    !["queued", "running"].includes(job.state) ||
    (job.state === "running" &&
      job.leaseUntil > ctx.timestamp.microsSinceUnixEpoch)
  )
    throw new SenderError("Job is not claimable.");
  // Never automatically repeat a billed investigation after an uncertain outcome.
  if (job.withAi && job.attempt > 0)
    throw new SenderError("Interrupted AI work needs a new explicit run.");
  if (job.attempt >= 3) throw new SenderError("Job attempt limit reached.");
  ctx.db.job.id.update({
    ...job,
    state: "running",
    attempt: job.attempt + 1,
    leaseUntil:
      ctx.timestamp.microsSinceUnixEpoch +
      (job.withAi ? 600_000_000n : 60_000_000n),
  });
  const { room, run } = loadRun(ctx, job.roomId, job.runId);
  if (job.kind === "compare") run.state = "running";
  else {
    const decision = run.decisions.find(
      (d) => d.version === job.decisionVersion,
    );
    if (decision?.validation) decision.validation.state = "running";
  }
  ctx.db.room.id.update(room);
});

export const commitJob = db.reducer(
  {
    jobId: t.string(),
    attempt: t.u32(),
    candidateHash: t.string(),
    comparison: t.option(comparisonType),
    validation: t.option(validationType),
    diagnostic: t.string(),
  },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.job.id.find(args.jobId);
    if (
      !job ||
      job.attempt !== args.attempt ||
      job.candidateHash !== args.candidateHash
    )
      throw new SenderError("Obsolete worker attempt.");
    if (job.state === "completed") {
      const { run } = loadRun(ctx, job.roomId, job.runId);
      const existing =
        job.kind === "compare"
          ? run.comparison
          : run.decisions.find((d) => d.version === job.decisionVersion)
              ?.validation;
      const supplied =
        job.kind === "compare" ? args.comparison : args.validation;
      if (JSON.stringify(existing) !== JSON.stringify(supplied))
        throw new SenderError("Completed result cannot be overwritten.");
      return;
    }
    if (
      !["running", "cancelling"].includes(job.state) ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Worker lease expired or job cancelled.");
    const { room, run } = loadRun(ctx, job.roomId, job.runId);
    if (job.state === "cancelling") {
      run.state = "cancelled";
      const decision = run.decisions.find(
        (d) => d.version === job.decisionVersion,
      );
      if (decision?.validation) decision.validation.state = "cancelled";
      ctx.db.job.id.update({ ...job, state: "cancelled" });
    } else {
      if (job.kind === "compare") {
        if (
          args.comparison &&
          args.comparison.cases.length > 0 &&
          args.comparison.cases.length <= 20
        ) {
          checkComparison(run, args.comparison, job.candidateHash);
          run.comparison = args.comparison;
          run.state = "compared";
        } else run.state = "error";
        run.diagnostic = args.diagnostic || undefined;
      } else {
        const decision = run.decisions.find(
          (d) => d.version === job.decisionVersion,
        );
        if (!decision) throw new SenderError("Decision version missing.");
        if (args.validation) {
          if (
            args.validation.candidateHash !== job.candidateHash ||
            args.validation.candidate !== job.candidate ||
            args.validation.cases.length !== decision.cases.length
          )
            throw new SenderError("Validation snapshot mismatch.");
          if (
            args.validation.cases.some(
              (c, index) =>
                c.id !== decision.cases[index].id ||
                JSON.stringify(c.expected) !==
                  JSON.stringify(decision.cases[index].expected),
            )
          )
            throw new SenderError(
              "Validation expectations differ from approved revision.",
            );
          for (const c of args.validation.cases) {
            if (c.actual) {
              returnOutputSchema.parse(c.actual);
              const equal =
                c.actual.eligible === c.expected.eligible &&
                c.actual.refund_cents === c.expected.refund_cents &&
                c.actual.reason === c.expected.reason;
              if (c.state !== (equal ? "pass" : "fail"))
                throw new SenderError(
                  "Validation verdict differs from actual output.",
                );
            } else if (c.state !== "error")
              throw new SenderError("Missing output is an execution error.");
          }
          const state = args.validation.cases.some((c) => c.state === "error")
            ? "error"
            : args.validation.cases.some((c) => c.state === "fail")
              ? "fail"
              : "pass";
          if (args.validation.state !== state)
            throw new SenderError(
              "Validation summary differs from measured cases.",
            );
          decision.validation = args.validation;
        } else if (decision.validation) {
          decision.validation.state = "error";
          decision.validation.diagnostic = args.diagnostic;
        }
      }
      ctx.db.job.id.update({ ...job, state: "completed" });
    }
    run.activity.push({
      id: `${job.id}:${job.attempt}`,
      label:
        job.kind === "compare"
          ? "Measured comparison finished"
          : "Acceptance validation finished",
      state: run.state === "error" ? "failed" : "completed",
      createdAt: timestamp(ctx),
    });
    ctx.db.room.id.update(room);
  },
);

export const recordComparison = db.reducer(
  {
    jobId: t.string(),
    attempt: t.u32(),
    candidateHash: t.string(),
    comparison: comparisonType,
  },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.job.id.find(args.jobId);
    if (
      !job ||
      job.kind !== "compare" ||
      job.state !== "running" ||
      job.attempt !== args.attempt ||
      job.candidateHash !== args.candidateHash ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Obsolete measured comparison.");
    const { room, run } = loadRun(ctx, job.roomId, job.runId);
    checkComparison(run, args.comparison, job.candidateHash);
    run.comparison = args.comparison;
    ctx.db.room.id.update(room);
  },
);

export const recordActivity = db.reducer(
  { jobId: t.string(), attempt: t.u32(), event: activityType },
  (ctx, args) => {
    requireWorker(ctx);
    const job = ctx.db.job.id.find(args.jobId);
    if (
      !job ||
      job.attempt !== args.attempt ||
      job.state !== "running" ||
      job.leaseUntil < ctx.timestamp.microsSinceUnixEpoch
    )
      throw new SenderError("Obsolete activity.");
    const { room, run } = loadRun(ctx, job.roomId, job.runId);
    if (run.activity.length >= 100 || args.event.label.length > 2000)
      throw new SenderError("Activity budget exhausted.");
    run.activity.push({ ...args.event, createdAt: timestamp(ctx) });
    ctx.db.room.id.update(room);
  },
);

/** Recover cancellation and uncertain billed work without replaying provider requests. */
export const recoverExpiredJobs = db.reducer((ctx) => {
  requireWorker(ctx);
  for (const job of ctx.db.job.iter()) {
    if (
      job.leaseUntil >= ctx.timestamp.microsSinceUnixEpoch ||
      !["running", "cancelling"].includes(job.state)
    )
      continue;
    if (job.state === "running" && !job.withAi && job.attempt < 3) continue;
    const { room, run } = loadRun(ctx, job.roomId, job.runId);
    const state = job.state === "cancelling" ? "cancelled" : "error";
    ctx.db.job.id.update({ ...job, state });
    if (job.kind === "compare") {
      run.state = state;
      run.diagnostic =
        "Worker lease expired. Start a new run; uncertain provider work was not retried.";
    } else {
      const decision = run.decisions.find(
        (d) => d.version === job.decisionVersion,
      );
      if (decision?.validation) {
        decision.validation.state = state;
        decision.validation.diagnostic = "Worker lease expired.";
      }
    }
    ctx.db.room.id.update(room);
  }
});
