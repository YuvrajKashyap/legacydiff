/**
 * Define the records saved in the database.
 * Private records are shown only through access-controlled views.
 */
import { schema, table, t } from "spacetimedb/server";

export const inputType = t.object("ReturnInput", {
  age_days: t.u32(),
  price_cents: t.u32(),
  has_receipt: t.bool(),
  final_sale: t.bool(),
});
export const outputType = t.object("ReturnOutput", {
  eligible: t.bool(),
  refund_cents: t.u32(),
  reason: t.string(),
});
export const caseType = t.object("ApprovedCase", {
  id: t.string(),
  input: inputType,
  expected: outputType,
});
export const executionType = t.object("Execution", {
  status: t.string(),
  output: t.option(outputType),
  diagnostic: t.option(t.string()),
  duration_ms: t.f64(),
  sha256: t.string(),
  variant: t.string(),
});
export const comparedCaseType = t.object("ComparedCase", {
  id: t.string(),
  input: inputType,
  baseline: executionType,
  candidate: executionType,
  differences: t.array(t.string()),
  state: t.string(),
});
export const comparisonType = t.object("Comparison", {
  cases: t.array(comparedCaseType),
  mismatch_count: t.u32(),
  error_count: t.u32(),
});
export const evidenceType = t.object("Evidence", {
  id: t.string(),
  title: t.string(),
  text: t.string(),
  sha256: t.string(),
  file: t.string(),
  lineStart: t.u32(),
  lineEnd: t.u32(),
  provenance: t.string(),
  url: t.option(t.string()),
});
export const variantType = t.object("SourceVariant", {
  id: t.string(),
  file: t.string(),
  entry_point: t.string(),
  revision: t.string(),
  sha256: t.string(),
  source: t.string(),
});
export const modelType = t.object("ModelOption", {
  id: t.string(),
  label: t.string(),
  ready: t.bool(),
  reason: t.string(),
});
export const catalogType = t.object("CatalogValue", {
  variants: t.array(variantType),
  evidence: t.array(evidenceType),
  models: t.array(modelType),
  runnerMode: t.string(),
  expectedCases: t.object("ExpectedCases", {
    include: t.array(caseType),
    exclude: t.array(caseType),
  }),
});
export const proposalType = t.object("Proposal", {
  revision: t.u32(),
  author: t.string(),
  choice: t.string(),
  rationale: t.string(),
  evidenceIds: t.array(t.string()),
  cases: t.array(caseType),
  createdAt: t.string(),
});
export const validationType = t.object("Validation", {
  state: t.string(),
  candidate: t.string(),
  candidateHash: t.string(),
  diagnostic: t.option(t.string()),
  cases: t.array(
    t.object("ValidationCase", {
      id: t.string(),
      expected: outputType,
      actual: t.option(outputType),
      state: t.string(),
    }),
  ),
});
export const decisionType = t.object("Decision", {
  version: t.u32(),
  proposalRevision: t.u32(),
  reviewer: t.string(),
  createdAt: t.string(),
  choice: t.string(),
  rationale: t.string(),
  cases: t.array(caseType),
  validation: t.option(validationType),
});
export const activityType = t.object("Activity", {
  id: t.string(),
  label: t.string(),
  state: t.string(),
  createdAt: t.string(),
});
export const runType = t.object("Run", {
  id: t.string(),
  baseline: t.string(),
  candidate: t.string(),
  modelId: t.string(),
  createdAt: t.string(),
  state: t.string(),
  reviewState: t.string(),
  comparison: t.option(comparisonType),
  evidence: t.array(evidenceType),
  sourceVariants: t.array(variantType),
  proposals: t.array(proposalType),
  decisions: t.array(decisionType),
  comments: t.array(
    t.object("Comment", {
      id: t.string(),
      author: t.string(),
      text: t.string(),
      createdAt: t.string(),
    }),
  ),
  pins: t.array(
    t.object("Pin", { author: t.string(), evidenceId: t.string() }),
  ),
  activity: t.array(activityType),
  diagnostic: t.option(t.string()),
});
const memberType = t.object("Member", {
  identity: t.string(),
  label: t.string(),
  role: t.string(),
});

// A bounded room is the transaction aggregate. Immutable revisions stay in its history.
// Separate indexed membership rows authorize access without trusting a client filter.
export const room = table(
  { name: "room" },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    owner: t.string(),
    members: t.array(memberType),
    runs: t.array(runType),
  },
);
export const membership = table(
  { name: "membership" },
  {
    id: t.string().primaryKey(),
    roomId: t.string().index("btree"),
    identity: t.identity().index("btree"),
    role: t.string(),
  },
);
export const joinRequest = table(
  { name: "join_request" },
  {
    id: t.string().primaryKey(),
    roomId: t.string(),
    identity: t.string(),
    principal: t.identity(),
    label: t.string(),
    state: t.string(),
  },
);
export const presence = table(
  { name: "presence" },
  { id: t.string().primaryKey(), identity: t.string(), expiresAt: t.u64() },
);
export const receipt = table(
  { name: "receipt" },
  { id: t.string().primaryKey(), payload: t.string() },
);
export const job = table(
  { name: "job" },
  {
    id: t.string().primaryKey(),
    roomId: t.string(),
    runId: t.string(),
    kind: t.string(),
    decisionVersion: t.u32(),
    candidate: t.string(),
    candidateHash: t.string(),
    state: t.string(),
    attempt: t.u32(),
    leaseUntil: t.u64(),
    withAi: t.bool(),
  },
);
export const configuration = table(
  { name: "configuration" },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    worker: t.option(t.identity()),
  },
);
export const catalog = table(
  { name: "catalog", public: true },
  { id: t.string().primaryKey(), value: catalogType, updatedAt: t.u64() },
);

export const artifactType = t.object("ArtifactValue", {
  id: t.string(),
  path: t.string(),
  sha256: t.string(),
  repository: t.string(),
  commit: t.option(t.string()),
  gitBlobSha: t.option(t.string()),
  text: t.string(),
  sourceBytesBase64: t.string(),
  source: t.string(),
  retrievedAt: t.string(),
  url: t.option(t.string()),
  startLine: t.u32(),
  endLine: t.u32(),
});
// Only reviewed synthetic/public artifacts, never room content or worker credentials.
export const artifactSnapshot = table(
  { name: "artifact_snapshot", public: true },
  { key: t.string().primaryKey(), value: artifactType },
);

// Additive suite storage preserves existing returns records during local migrations.
export const suiteCatalog = table(
  { name: "suite_catalog", public: true },
  { id: t.string().primaryKey(), payload: t.string(), updatedAt: t.u64() },
);
export const suiteRun = table(
  { name: "suite_run" },
  {
    id: t.string().primaryKey(),
    roomId: t.string().index("btree"),
    payload: t.string(),
  },
);
export const suiteJob = table(
  { name: "suite_job" },
  {
    id: t.string().primaryKey(),
    roomId: t.string(),
    runId: t.string(),
    kind: t.string(),
    decisionVersion: t.u32(),
    state: t.string(),
    attempt: t.u32(),
    leaseUntil: t.u64(),
  },
);

const db = schema({
  room,
  membership,
  joinRequest,
  presence,
  receipt,
  job,
  configuration,
  catalog,
  artifactSnapshot,
  suiteCatalog,
  suiteRun,
  suiteJob,
});
export default db;
