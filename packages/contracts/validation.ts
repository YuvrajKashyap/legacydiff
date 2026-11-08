/**
 * Check data returned by the original returns runner.
 * A crashed execution is different from an output that fails an approved expectation.
 */
/** Strict JSON contracts shared by the private worker and investigation tools. */
import { z } from "zod";

export const variantIdSchema = z.enum([
  "legacy-v1",
  "rewrite-v2",
  "corrected-v2",
]);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const caseIdSchema = z.string().min(1).max(80);
const runnerModeSchema = z.literal(
  "trusted-fixture local fallback (reduced isolation; local-only)",
);
export const returnInputSchema = z
  .object({
    age_days: z.number().int().min(0).max(365),
    price_cents: z.number().int().min(0).max(1_000_000),
    has_receipt: z.boolean(),
    final_sale: z.boolean(),
  })
  .strict();
export const returnOutputSchema = z
  .object({
    eligible: z.boolean(),
    refund_cents: z.number().int().min(0).max(1_000_000),
    reason: z.enum([
      "final_sale",
      "missing_receipt",
      "outside_window",
      "eligible",
    ]),
  })
  .strict()
  .refine(
    (output) =>
      output.eligible === (output.reason === "eligible") &&
      (output.eligible || output.refund_cents === 0),
    "Inconsistent return output",
  );
export const caseSchema = z
  .object({ id: caseIdSchema, input: returnInputSchema })
  .strict();
export const approvedCaseSchema = caseSchema
  .extend({ expected: returnOutputSchema })
  .strict();
const outputKeys = ["eligible", "refund_cents", "reason"] as const;
type Output = z.infer<typeof returnOutputSchema>;
function differingFields(left: Output, right: Output): string[] {
  return outputKeys.filter((key) => left[key] !== right[key]);
}
function uniqueCaseIds(cases: { id: string }[]): boolean {
  return new Set(cases.map((item) => item.id)).size === cases.length;
}

const executionBase = z.object({
  variant: variantIdSchema,
  sha256: hashSchema,
  case_id: caseIdSchema,
  runner_mode: runnerModeSchema,
  duration_ms: z.number().min(0).max(600_000),
});
export const executionSchema = z.discriminatedUnion("status", [
  executionBase
    .extend({
      status: z.literal("success"),
      diagnostic: z.null(),
      output: returnOutputSchema,
    })
    .strict(),
  executionBase
    .extend({
      status: z.enum(["error", "timeout", "cancelled"]),
      diagnostic: z.string().min(1).max(1000),
    })
    .strict(),
]);
export const comparedCaseSchema = caseSchema
  .extend({
    baseline: executionSchema,
    candidate: executionSchema,
    differences: z.array(z.enum(outputKeys)).max(3),
    state: z.enum(["match", "mismatch", "error"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.baseline.case_id !== value.id ||
      value.candidate.case_id !== value.id
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Execution belongs to a different case",
      });
    }
    if (
      value.baseline.status !== "success" ||
      value.candidate.status !== "success"
    ) {
      if (value.state !== "error" || value.differences.length !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "Execution errors cannot be policy matches or mismatches",
        });
      }
      return;
    }
    const differences = differingFields(
      value.baseline.output,
      value.candidate.output,
    );
    if (
      value.state !== (differences.length ? "mismatch" : "match") ||
      value.differences.length !== differences.length ||
      !differences.every((key) =>
        value.differences.includes(key as (typeof outputKeys)[number]),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Comparison classification does not match measured outputs",
      });
    }
  });
export const comparisonSchema = z
  .object({
    schema_version: z.literal(1),
    baseline: z.literal("legacy-v1"),
    candidate: z.enum(["rewrite-v2", "corrected-v2"]),
    cases: z
      .array(comparedCaseSchema)
      .min(1)
      .max(20)
      .refine(uniqueCaseIds, "Duplicate case IDs"),
    mismatch_count: z.number().int().min(0).max(20),
    error_count: z.number().int().min(0).max(20),
    runner_mode: runnerModeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.mismatch_count !==
        value.cases.filter((item) => item.state === "mismatch").length ||
      value.error_count !==
        value.cases.filter((item) => item.state === "error").length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Comparison counts do not match the measured cases",
      });
    }
    if (
      value.cases.some(
        (item) =>
          item.baseline.variant !== value.baseline ||
          item.candidate.variant !== value.candidate,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Execution variant differs from the pinned comparison pair",
      });
    }
  });

export const validationCaseSchema = approvedCaseSchema
  .extend({
    actual: returnOutputSchema.nullable(),
    state: z.enum(["pass", "fail", "error"]),
    execution: executionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.execution.case_id !== value.id) {
      ctx.addIssue({
        code: "custom",
        message: "Validation execution belongs to a different case",
      });
    }
    if (value.execution.status !== "success") {
      if (value.state !== "error" || value.actual !== null) {
        ctx.addIssue({
          code: "custom",
          message: "Execution failure cannot yield a policy verdict",
        });
      }
      return;
    }
    if (
      !value.actual ||
      differingFields(value.actual, value.execution.output).length !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Actual output differs from execution output",
      });
      return;
    }
    const expectedState = differingFields(value.actual, value.expected).length
      ? "fail"
      : "pass";
    if (value.state !== expectedState) {
      ctx.addIssue({
        code: "custom",
        message:
          "Validation verdict differs from actual versus expected output",
      });
    }
  });
export const validationResultSchema = z
  .object({
    schema_version: z.literal(1),
    variant: variantIdSchema,
    state: z.enum(["pass", "fail", "error"]),
    cases: z
      .array(validationCaseSchema)
      .min(1)
      .max(20)
      .refine(uniqueCaseIds, "Duplicate case IDs"),
    runner_mode: runnerModeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const state = value.cases.some((item) => item.state === "error")
      ? "error"
      : value.cases.some((item) => item.state === "fail")
        ? "fail"
        : "pass";
    if (
      value.state !== state ||
      value.cases.some((item) => item.execution.variant !== value.variant)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Validation summary or variant differs from its cases",
      });
    }
  });

const sourceFields = {
  file: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+\.(py|md)$/)
    .max(100),
  sha256: hashSchema,
  source: z
    .string()
    .min(1)
    .max(48 * 1024),
  provenance: z.literal("Local fixture"),
};
const variantSchema = z
  .object({
    ...sourceFields,
    id: variantIdSchema,
    entry_point: z.literal("evaluate"),
    revision: z.string().min(1).max(100),
    contract: z.literal("returns-v1"),
  })
  .strict();
const evidenceSchema = z
  .object({
    ...sourceFields,
    id: z.enum(["operations-handbook", "migration-ticket"]),
    line_start: z.number().int().min(1).max(1000),
    line_end: z.number().int().min(1).max(1000),
  })
  .strict()
  .refine(
    (item) =>
      item.line_end >= item.line_start &&
      item.line_end <= item.source.split("\n").length,
    "Evidence line range is invalid",
  );
export const runnerManifestSchema = z
  .object({
    schema_version: z.literal(1),
    fixture_version: z.literal(1),
    variants: z
      .array(variantSchema)
      .length(3)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === 3,
        "Duplicate variants",
      ),
    evidence: z
      .array(evidenceSchema)
      .length(2)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === 2,
        "Duplicate evidence",
      ),
    compatible_pairs: z
      .array(
        z.tuple([
          z.literal("legacy-v1"),
          z.enum(["rewrite-v2", "corrected-v2"]),
        ]),
      )
      .length(2)
      .refine(
        (items) => new Set(items.map((item) => item.join(":"))).size === 2,
        "Duplicate pairs",
      ),
    runner_mode: runnerModeSchema,
    initial_cases: z
      .array(caseSchema)
      .min(1)
      .max(20)
      .refine(uniqueCaseIds, "Duplicate case IDs"),
  })
  .strict();

export type ValidatedComparison = z.infer<typeof comparisonSchema>;
export type ValidatedValidation = z.infer<typeof validationResultSchema>;
export type RunnerManifest = z.infer<typeof runnerManifestSchema>;
