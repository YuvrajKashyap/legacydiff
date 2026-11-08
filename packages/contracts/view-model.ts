/**
 * Describe the data and actions available to the frontend.
 * New screens use these types without depending on backend implementation details.
 */
import type {
  ScenarioDefinition,
  ScenarioRun,
  ScenarioActions,
} from "./scenarios";
/** Presentation contract. The client adapter supplies only confirmed server data. */
export type Choice = "include" | "exclude";
export type Role = "engineer" | "reviewer";
export interface ReturnInput {
  age_days: number;
  price_cents: number;
  has_receipt: boolean;
  final_sale: boolean;
}
export interface ReturnOutput {
  eligible: boolean;
  refund_cents: number;
  reason: string;
}
export interface ApprovedCase {
  id: string;
  input: ReturnInput;
  expected: ReturnOutput;
}
export interface Execution {
  status: "success" | "error" | "timeout" | "cancelled";
  output?: ReturnOutput;
  diagnostic?: string;
  duration_ms: number;
  sha256: string;
  variant: string;
}
export interface ComparedCase {
  id: string;
  input: ReturnInput;
  baseline: Execution;
  candidate: Execution;
  differences: string[];
  state: "match" | "mismatch" | "error";
}
export interface Evidence {
  id: string;
  title: string;
  text: string;
  sha256: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  provenance: "Live" | "Cached" | "Local fixture";
  url?: string;
}
export interface SourceVariant {
  id: string;
  file: string;
  entry_point: string;
  revision: string;
  sha256: string;
  source: string;
}
export interface ModelOption {
  id: string;
  label: string;
  ready: boolean;
  reason: string;
}
export interface Catalog {
  variants: SourceVariant[];
  evidence: Evidence[];
  models: ModelOption[];
  runnerMode: string;
  expectedCases: Record<Choice, ApprovedCase[]>;
}
export interface Proposal {
  revision: number;
  author: string;
  choice: Choice;
  rationale: string;
  evidenceIds: string[];
  cases: ApprovedCase[];
  createdAt: string;
}
export interface Validation {
  state: "queued" | "running" | "pass" | "fail" | "error" | "cancelled";
  candidate: string;
  candidateHash: string;
  diagnostic?: string;
  cases: Array<{
    id: string;
    expected: ReturnOutput;
    actual?: ReturnOutput;
    state: string;
  }>;
}
export interface Decision {
  version: number;
  proposalRevision: number;
  reviewer: string;
  createdAt: string;
  choice: Choice;
  rationale: string;
  cases: ApprovedCase[];
  validation?: Validation;
}
export interface Run {
  id: string;
  baseline: string;
  candidate: string;
  modelId: string;
  createdAt: string;
  sourceVariants?: SourceVariant[];
  state: string;
  reviewState: "needs_review" | "deferred" | "decided";
  comparison?: {
    cases: ComparedCase[];
    mismatch_count: number;
    error_count: number;
  };
  evidence: Evidence[];
  proposals: Proposal[];
  decisions: Decision[];
  comments: Array<{
    id: string;
    author: string;
    text: string;
    createdAt: string;
  }>;
  pins: Array<{ author: string; evidenceId: string }>;
  activity: Array<{
    id: string;
    label: string;
    state: string;
    createdAt: string;
  }>;
  diagnostic?: string;
}
export interface Room {
  id: string;
  name: string;
  owner: string;
  members: Array<{ identity: string; label: string; role: Role }>;
  runs: Run[];
}
export interface JoinRequest {
  id: string;
  roomId: string;
  identity: string;
  label: string;
  state: string;
}
export interface Presence {
  roomId: string;
  identity: string;
}
export interface RunAddress {
  roomId: string;
  runId: string;
}
export interface Actions {
  startComparison(input: {
    name: string;
    label: string;
    candidate: string;
    modelId: string;
    withAi: boolean;
    requestId: string;
    roomId?: string;
  }): Promise<RunAddress>;
  requestJoin(input: { roomId: string; label: string }): Promise<void>;
  admitMember(input: { requestId: string; role: Role }): Promise<void>;
  publishProposal(
    input: RunAddress & {
      expectedRevision: number;
      choice: Choice;
      rationale: string;
      evidenceIds: string[];
      requestId: string;
    },
  ): Promise<void>;
  approveProposal(
    input: RunAddress & {
      expectedRevision: number;
      expectedDecisionVersion: number;
      requestId: string;
    },
  ): Promise<void>;
  addComment(
    input: RunAddress & { text: string; requestId: string },
  ): Promise<void>;
  pinEvidence(
    input: RunAddress & { evidenceId: string; requestId: string },
  ): Promise<void>;
  deferFinding(input: RunAddress & { requestId: string }): Promise<void>;
  requestChanges(
    input: RunAddress & { text: string; requestId: string },
  ): Promise<void>;
  cancelRun(input: RunAddress & { requestId: string }): Promise<void>;
  exportBundle(input: RunAddress & { decisionVersion: number }): Promise<void>;
}
export interface LegacyDiffState {
  scenarios: ScenarioDefinition[];
  scenarioRuns: ScenarioRun[];
  scenarioActions: ScenarioActions;
  ready: boolean;
  identity: string;
  error: string;
  rooms: Room[];
  requests: JoinRequest[];
  presence: Presence[];
  catalog: Catalog | null;
  actions: Actions;
}
