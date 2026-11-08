/**
 * Describe valid scenario inputs, results and review records.
 * Reject results whose counts or match labels disagree with their actual outputs.
 */
import { z } from "zod";

const id = z.string().min(1).max(100);
const description = z.string().min(1).max(4000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().min(1).max(80);
const file = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes(":") &&
      !value.split("/").includes(".."),
    "Expected a relative reviewed fixture path",
  );
export const scenarioIdSchema = z.enum([
  "returns",
  "pricing",
  "accounts-payable",
  "permissions",
]);
export const scalarRecordSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(80)
      .refine(
        (key) => !["__proto__", "constructor", "prototype"].includes(key),
      ),
    z.union([
      z.string().max(2000),
      z.number().finite().min(-1e12).max(1e12),
      z.boolean(),
      z.null(),
    ]),
  )
  .refine(
    (value) => Object.keys(value).length <= 20,
    "At most 20 scalar fields are allowed",
  );
export const scenarioOutputSchema = z
  .record(
    z.string().min(1).max(80),
    z.union([
      z.string().max(2000),
      z.number().finite().min(-1e12).max(1e12),
      z.boolean(),
      z.null(),
      z
        .array(
          z.union([
            z.string().max(200),
            z.number().finite().min(-1e12).max(1e12),
            z.boolean(),
            z.null(),
          ]),
        )
        .max(20),
    ]),
  )
  .refine(
    (value) => Object.keys(value).length <= 20,
    "At most 20 output fields are allowed",
  );
const approvedCase = z
  .object({ id, input: scalarRecordSchema, expected: scenarioOutputSchema })
  .strict();
const uniqueIds = (values: { id: string }[]) =>
  new Set(values.map((value) => value.id)).size === values.length;
const evidenceIds = z
  .array(id)
  .max(20)
  .refine(
    (values) => new Set(values).size === values.length,
    "Duplicate evidence IDs",
  );
const variant = z
  .object({ id, file, sha256: hash, source: z.string().min(1).max(100000) })
  .strict();

export const scenarioDefinitionSchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1).max(200),
    description,
    decision_owner: z.string().min(1).max(200),
    baseline: id,
    candidate: id,
    variants: z.array(variant).min(2).max(10),
    evidence: z
      .array(
        z
          .object({
            id,
            title: z.string().min(1).max(200),
            file,
            sha256: hash,
            source: z.string().min(1).max(100000),
            line_start: z.number().int().positive().max(10000),
            line_end: z.number().int().positive().max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    policies: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(200),
            description,
            security_required: z.boolean(),
            cases: z
              .array(approvedCase)
              .min(1)
              .max(400)
              .refine(uniqueIds, "Duplicate policy case IDs"),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    dataset: z
      .object({
        version: id,
        sha256: hash,
        count: z.number().int().min(1).max(400),
        categories: z.array(id).min(1).max(40),
        cases: z
          .array(
            z.object({ id, input: scalarRecordSchema, category: id }).strict(),
          )
          .min(1)
          .max(400),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    for (const values of [
      value.variants,
      value.evidence,
      value.policies,
      value.dataset.cases,
    ]) {
      if (!uniqueIds(values)) invalid("Duplicate manifest IDs");
    }
    if (
      value.baseline === value.candidate ||
      ![value.baseline, value.candidate].every((name) =>
        value.variants.some((item) => item.id === name),
      )
    )
      invalid("Invalid source pair");
    if (
      new Set(value.variants.map((item) => item.sha256)).size !==
      value.variants.length
    )
      invalid("Duplicate variant hashes");
    if (value.dataset.count !== value.dataset.cases.length)
      invalid("Dataset count does not match cases");
    if (
      new Set(value.dataset.categories).size !==
        value.dataset.categories.length ||
      value.dataset.cases.some(
        (item) => !value.dataset.categories.includes(item.category),
      )
    )
      invalid("Invalid dataset categories");
    for (const item of value.evidence) {
      if (
        item.line_end < item.line_start ||
        item.line_end > item.source.split("\n").length
      )
        invalid("Evidence line range is outside its source");
    }
  });

export const suiteManifestSchema = z
  .object({
    schema_version: z.literal(1),
    scenarios: z
      .array(scenarioDefinitionSchema)
      .length(4)
      .refine(uniqueIds, "Duplicate scenario IDs"),
  })
  .strict();

const execution = z
  .object({
    status: z.enum(["success", "error", "timeout", "cancelled"]),
    output: scenarioOutputSchema.optional(),
    diagnostic: z.string().max(2000).nullable().optional(),
    sha256: hash,
    variant: id,
    duration_ms: z.number().finite().min(0).max(600000),
  })
  .strict()
  .refine(
    (value) =>
      value.status === "success"
        ? value.output !== undefined
        : value.output === undefined,
    "Only successful executions have output",
  );

function differingFields(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

const comparedCase = z
  .object({
    id,
    input: scalarRecordSchema,
    baseline: execution,
    candidate: execution,
    differences: z.array(z.string().min(1).max(80)).max(40),
    state: z.enum(["match", "mismatch", "error"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const failed =
      value.baseline.status !== "success" ||
      value.candidate.status !== "success";
    const differences = failed
      ? []
      : differingFields(value.baseline.output!, value.candidate.output!);
    const state = failed ? "error" : differences.length ? "mismatch" : "match";
    if (
      state !== value.state ||
      JSON.stringify(differences) !==
        JSON.stringify([...value.differences].sort())
    )
      ctx.addIssue({
        code: "custom",
        message: "Case classification does not match measured outputs",
      });
  });
const requirementState = z.enum(["pass", "fail", "error"]);
export const suiteComparisonSchema = z
  .object({
    scenario: scenarioIdSchema,
    baseline: id,
    candidate: id,
    cases: z.array(comparedCase).min(1).max(400),
    mismatch_count: z.number().int().min(0).max(400),
    error_count: z.number().int().min(0).max(400),
    requirements: z
      .array(
        z
          .object({
            id,
            description,
            case_id: id,
            baseline: requirementState,
            candidate: requirementState,
          })
          .strict(),
      )
      .max(1600),
    dataset_hash: hash,
  })
  .strict()
  .superRefine((value, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (!uniqueIds(value.cases) || !uniqueIds(value.requirements))
      invalid("Duplicate result IDs");
    if (
      value.baseline === value.candidate ||
      value.cases.some(
        (item) =>
          item.baseline.variant !== value.baseline ||
          item.candidate.variant !== value.candidate,
      )
    )
      invalid("Execution source pair mismatch");
    if (
      value.mismatch_count !==
        value.cases.filter((item) => item.state === "mismatch").length ||
      value.error_count !==
        value.cases.filter((item) => item.state === "error").length
    )
      invalid("Result counts do not match cases");
    for (const requirement of value.requirements) {
      const measured = value.cases.find(
        (item) => item.id === requirement.case_id,
      );
      if (!measured) invalid("Requirement references an unknown case");
      else
        for (const side of ["baseline", "candidate"] as const) {
          if (
            (measured[side].status !== "success") !==
            (requirement[side] === "error")
          )
            invalid("Requirement misclassifies an execution error");
        }
    }
  });

const validatedCase = z
  .object({
    id,
    expected: scenarioOutputSchema,
    actual: scenarioOutputSchema.optional(),
    state: requirementState,
  })
  .strict()
  .refine((value) => {
    if (value.state === "error") return value.actual === undefined;
    if (value.actual === undefined) return false;
    return (
      (differingFields(value.expected, value.actual).length === 0) ===
      (value.state === "pass")
    );
  }, "Validation classification does not match actual output");
export const suiteValidationSchema = z
  .object({
    state: requirementState,
    cases: z.array(validatedCase).min(1).max(400),
    candidateHash: hash,
  })
  .strict()
  .refine((value) => {
    const state = value.cases.some((item) => item.state === "error")
      ? "error"
      : value.cases.some((item) => item.state === "fail")
        ? "fail"
        : "pass";
    return uniqueIds(value.cases) && state === value.state;
  }, "Validation summary does not match cases");

const proposal = z
  .object({
    revision: z.number().int().positive(),
    policyId: id,
    rationale: description,
    evidenceIds,
    author: id,
    createdAt: timestamp,
  })
  .strict();
const decision = z
  .object({
    version: z.number().int().positive(),
    proposalRevision: z.number().int().positive(),
    policyId: id,
    rationale: description,
    evidenceIds,
    reviewer: id,
    createdAt: timestamp,
    validation: suiteValidationSchema.optional(),
  })
  .strict();
// Saved public events explain actual AI work without exposing private reasoning or keys.
export const aiTraceEventSchema = z
  .object({
    id,
    parentId: id.optional(),
    role: z.enum(["orchestrator", "behavior", "policy", "regression"]),
    kind: z.enum(["agent", "model", "tool", "handoff"]),
    state: z.enum(["running", "completed", "failed"]),
    label: z.string().min(1).max(200),
    detail: z.string().max(4000).optional(),
    createdAt: timestamp,
  })
  .strict();
export type AiTraceEvent = z.infer<typeof aiTraceEventSchema>;
export const investigationAttemptSchema = z
  .object({
    id: z.string().min(1).max(150),
    modelId: z.string().min(1).max(150),
    state: z.enum([
      "queued",
      "running",
      "cancelling",
      "completed",
      "partial",
      "failed",
      "cancelled",
    ]),
    createdAt: timestamp.optional(),
    completedAt: timestamp.optional(),
    outcome: z.string().max(100000).optional(),
    trace: z.array(aiTraceEventSchema).max(100),
    diagnostic: z.string().max(2000).optional(),
  })
  .strict();
export type InvestigationAttempt = z.infer<typeof investigationAttemptSchema>;

// Chat answers explain a saved case. They never become policy approvals.
export const caseChatResponseSchema = z
  .object({
    answer: z.string().min(1).max(6000),
    requestedModelId: z.string().min(1).max(150),
    actualModelId: z.string().min(1).max(150),
    citations: z
      .array(
        z
          .object({
            artifact_id: id,
            start_line: z.number().int().positive().max(10000),
            end_line: z.number().int().positive().max(10000),
            quote: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(8),
    caseIds: z.array(id).max(20),
    durationMs: z.number().finite().min(0).max(120000),
  })
  .strict();
export const caseChatTurnSchema = z
  .object({
    id,
    requestId: id,
    author: id,
    question: z.string().min(1).max(2000),
    state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
    requestedModelId: z.string().min(1).max(150),
    createdAt: timestamp,
    completedAt: timestamp.optional(),
    error: z.string().max(2000).optional(),
    response: caseChatResponseSchema.optional(),
    context: z
      .object({
        revision: z.number().int().min(0).max(50),
        decisionVersion: z.number().int().min(0).max(50),
        caseIds: z.array(id).min(1).max(20),
        priorTurnIds: z.array(id).max(6),
        datasetHash: hash,
        candidateHash: hash,
        specialistSummaries: z
          .array(
            z
              .object({
                role: z.enum([
                  "orchestrator",
                  "behavior",
                  "policy",
                  "regression",
                ]),
                state: z.enum(["completed", "failed"]),
                summary: z.string().max(1500),
              })
              .strict(),
          )
          .max(4)
          .optional(),
      })
      .strict(),
  })
  .strict();
export type CaseChatTurn = z.infer<typeof caseChatTurnSchema>;
export type CaseChatResponse = z.infer<typeof caseChatResponseSchema>;

export const scenarioRunSchema = z
  .object({
    id,
    roomId: id,
    scenarioId: scenarioIdSchema,
    modelId: z.string().max(150).optional(),
    withAi: z.boolean().optional(),
    investigation: z.string().max(100000).optional(),
    investigationAttempts: z
      .array(investigationAttemptSchema)
      .max(10)
      .optional(),
    latestSuccessfulInvestigationId: z.string().max(150).optional(),
    investigationState: z
      .enum([
        "queued",
        "running",
        "cancelling",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ])
      .optional(),
    aiTrace: z.array(aiTraceEventSchema).max(100).optional(),
    chat: z.array(caseChatTurnSchema).max(20).optional(),
    createdAt: timestamp,
    state: z.enum([
      "queued",
      "running",
      "completed",
      "error",
      "cancelling",
      "cancelled",
    ]),
    reviewState: z.enum(["needs_review", "deferred", "decided"]),
    revision: z.number().int().min(0).max(50),
    decisionVersion: z.number().int().min(0).max(50),
    policyId: id.optional(),
    rationale: description.optional(),
    evidenceIds,
    proposals: z.array(proposal).max(50),
    decisions: z.array(decision).max(50),
    comparison: suiteComparisonSchema.optional(),
    diagnostic: z.string().max(4000).optional(),
    comments: z
      .array(
        z
          .object({ id, author: id, text: description, createdAt: timestamp })
          .strict(),
      )
      .max(200),
    activity: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(2000),
            state: z.enum([
              "queued",
              "working",
              "running",
              "waiting",
              "completed",
              "failed",
              "error",
              "cancelled",
            ]),
            createdAt: timestamp,
          })
          .strict(),
      )
      .max(200),
    manifest: scenarioDefinitionSchema,
  })
  .strict();

export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;
export type SuiteComparison = z.infer<typeof suiteComparisonSchema>;
export type SuiteValidation = z.infer<typeof suiteValidationSchema>;
export type ScenarioRun = z.infer<typeof scenarioRunSchema>;

export interface ScenarioActions {
  ask(input: {
    roomId: string;
    runId: string;
    modelId: string;
    question: string;
    expectedRevision: number;
    expectedDecisionVersion: number;
    requestId: string;
    caseId?: string;
  }): Promise<void>;
  start(input: {
    scenarioId: string;
    baseline?: string;
    candidate?: string;
    name: string;
    label: string;
    requestId: string;
    modelId?: string;
    withAi?: boolean;
  }): Promise<{ roomId: string; runId: string }>;
  publish(input: {
    roomId: string;
    runId: string;
    expectedRevision: number;
    expectedDecisionVersion: number;
    policyId: string;
    rationale: string;
    evidenceIds: string[];
    requestId: string;
  }): Promise<void>;
  approveDraft(input: Parameters<ScenarioActions["publish"]>[0]): Promise<void>;
  approve(input: {
    roomId: string;
    runId: string;
    expectedRevision: number;
    expectedDecisionVersion: number;
    requestId: string;
  }): Promise<void>;
  comment(input: {
    roomId: string;
    runId: string;
    text: string;
    requestId: string;
  }): Promise<void>;
  defer(input: {
    roomId: string;
    runId: string;
    requestId: string;
  }): Promise<void>;
  investigate(input: {
    roomId: string;
    runId: string;
    modelId: string;
    requestId: string;
  }): Promise<void>;
  resume(input: {
    roomId: string;
    runId: string;
    requestId: string;
  }): Promise<void>;
  cancel(input: {
    roomId: string;
    runId: string;
    requestId: string;
  }): Promise<void>;
  export(input: {
    roomId: string;
    runId: string;
    decisionVersion: number;
  }): Promise<void>;
}
