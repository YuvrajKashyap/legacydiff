/** Generated SDK accessors use camel case; the runner/UI contract preserves business JSON names. */
import type * as Wire from "../client/generated/types";
import type {
  ApprovedCase,
  Catalog,
  Choice,
  ComparedCase,
  Evidence,
  Execution,
  ReturnInput,
  ReturnOutput,
  Room,
  Run,
  Validation,
} from "./view-model";

function oneOf<T extends string>(
  value: string,
  permitted: readonly T[],
  field: string,
): T {
  if (!permitted.includes(value as T))
    throw new Error(`Unsupported ${field} in the confirmed snapshot.`);
  return value as T;
}
function inputFromWire(value: Wire.ReturnInput): ReturnInput {
  return {
    age_days: value.ageDays,
    price_cents: value.priceCents,
    has_receipt: value.hasReceipt,
    final_sale: value.finalSale,
  };
}
function inputToWire(value: ReturnInput): Wire.ReturnInput {
  return {
    ageDays: value.age_days,
    priceCents: value.price_cents,
    hasReceipt: value.has_receipt,
    finalSale: value.final_sale,
  };
}
function outputFromWire(value: Wire.ReturnOutput): ReturnOutput {
  return {
    eligible: value.eligible,
    refund_cents: value.refundCents,
    reason: value.reason,
  };
}
function outputToWire(value: ReturnOutput): Wire.ReturnOutput {
  return {
    eligible: value.eligible,
    refundCents: value.refund_cents,
    reason: value.reason,
  };
}
function caseFromWire(value: Wire.ApprovedCase): ApprovedCase {
  return {
    id: value.id,
    input: inputFromWire(value.input),
    expected: outputFromWire(value.expected),
  };
}
function caseToWire(value: ApprovedCase): Wire.ApprovedCase {
  return {
    id: value.id,
    input: inputToWire(value.input),
    expected: outputToWire(value.expected),
  };
}
function evidenceFromWire(value: Wire.Evidence): Evidence {
  return {
    ...value,
    provenance: oneOf(
      value.provenance,
      ["Live", "Cached", "Local fixture"],
      "evidence provenance",
    ),
  };
}
function executionFromWire(value: Wire.Execution): Execution {
  return {
    status: oneOf(
      value.status,
      ["success", "error", "timeout", "cancelled"],
      "execution status",
    ),
    ...(value.output ? { output: outputFromWire(value.output) } : {}),
    ...(value.diagnostic ? { diagnostic: value.diagnostic } : {}),
    duration_ms: value.durationMs,
    sha256: value.sha256,
    variant: value.variant,
  };
}
function executionToWire(value: Execution): Wire.Execution {
  return {
    status: value.status,
    output: value.output ? outputToWire(value.output) : undefined,
    diagnostic: value.diagnostic,
    durationMs: value.duration_ms,
    sha256: value.sha256,
    variant: value.variant,
  };
}
function comparisonCaseFromWire(value: Wire.ComparedCase): ComparedCase {
  return {
    id: value.id,
    input: inputFromWire(value.input),
    baseline: executionFromWire(value.baseline),
    candidate: executionFromWire(value.candidate),
    differences: value.differences,
    state: oneOf(value.state, ["match", "mismatch", "error"], "case state"),
  };
}
export function comparisonToWire(
  value: NonNullable<Run["comparison"]>,
): Wire.Comparison {
  return {
    cases: value.cases.map((item) => ({
      id: item.id,
      input: inputToWire(item.input),
      baseline: executionToWire(item.baseline),
      candidate: executionToWire(item.candidate),
      differences: item.differences,
      state: item.state,
    })),
    mismatchCount: value.mismatch_count,
    errorCount: value.error_count,
  };
}
function validationFromWire(value: Wire.Validation): Validation {
  return {
    ...value,
    state: oneOf(
      value.state,
      ["queued", "running", "pass", "fail", "error", "cancelled"],
      "validation state",
    ),
    cases: value.cases.map((item) => ({
      ...item,
      expected: outputFromWire(item.expected),
      actual: item.actual ? outputFromWire(item.actual) : undefined,
    })),
  };
}
export function validationToWire(value: Validation): Wire.Validation {
  return {
    ...value,
    diagnostic: value.diagnostic,
    cases: value.cases.map((item) => ({
      ...item,
      expected: outputToWire(item.expected),
      actual: item.actual ? outputToWire(item.actual) : undefined,
    })),
  };
}
export function catalogFromWire(value: Wire.CatalogValue): Catalog {
  return {
    variants: value.variants.map((item) => ({
      id: item.id,
      file: item.file,
      entry_point: item.entryPoint,
      revision: item.revision,
      sha256: item.sha256,
      source: item.source,
    })),
    evidence: value.evidence.map(evidenceFromWire),
    models: value.models,
    runnerMode: value.runnerMode,
    expectedCases: {
      include: value.expectedCases.include.map(caseFromWire),
      exclude: value.expectedCases.exclude.map(caseFromWire),
    },
  };
}
export function catalogToWire(value: Catalog): Wire.CatalogValue {
  return {
    variants: value.variants.map((item) => ({
      id: item.id,
      file: item.file,
      entryPoint: item.entry_point,
      revision: item.revision,
      sha256: item.sha256,
      source: item.source,
    })),
    evidence: value.evidence.map((item) => ({ ...item, url: item.url })),
    models: value.models,
    runnerMode: value.runnerMode,
    expectedCases: {
      include: value.expectedCases.include.map(caseToWire),
      exclude: value.expectedCases.exclude.map(caseToWire),
    },
  };
}
export function roomFromWire(value: Wire.Room): Room {
  const choice = (value: string): Choice =>
    oneOf(value, ["include", "exclude"], "proposal choice");
  return {
    id: value.id,
    name: value.name,
    owner: value.owner,
    members: value.members.map((item) => ({
      ...item,
      role: oneOf(item.role, ["engineer", "reviewer"], "membership role"),
    })),
    runs: value.runs.map((run) => ({
      ...run,
      sourceVariants: run.sourceVariants.map((item) => ({
        id: item.id,
        file: item.file,
        entry_point: item.entryPoint,
        revision: item.revision,
        sha256: item.sha256,
        source: item.source,
      })),
      reviewState: oneOf(
        run.reviewState,
        ["needs_review", "deferred", "decided"],
        "review state",
      ),
      comparison: run.comparison
        ? {
            cases: run.comparison.cases.map(comparisonCaseFromWire),
            mismatch_count: run.comparison.mismatchCount,
            error_count: run.comparison.errorCount,
          }
        : undefined,
      evidence: run.evidence.map(evidenceFromWire),
      proposals: run.proposals.map((item) => ({
        ...item,
        choice: choice(item.choice),
        cases: item.cases.map(caseFromWire),
      })),
      decisions: run.decisions.map((item) => ({
        ...item,
        choice: choice(item.choice),
        cases: item.cases.map(caseFromWire),
        validation: item.validation
          ? validationFromWire(item.validation)
          : undefined,
      })),
    })),
  };
}
