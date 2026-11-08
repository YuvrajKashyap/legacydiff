/** Put classic and scenario runs into the same list format, using only their saved information. */
import type { Room } from "./view-model";
import type { ScenarioRun } from "../../packages/contracts/scenarios";
import {
  filterComparisons,
  latestProposal,
  variantLabel,
  type HomeView,
} from "./presentation";

export interface ComparisonSummary {
  roomId: string;
  runId: string;
  name: string;
  baseline: string;
  candidate: string;
  state: string;
  reviewState: string;
  measured: boolean;
  differences: number;
  totalCases: number;
  executionProblems: number;
  unmetRequirements: number | null;
  revision?: number;
  decision?: {
    version: number;
    proposalRevision: number;
    createdAt: string;
    validation?: { state: string };
  };
  updatedAt: string;
  createdAt: string;
  needsReview: boolean;
}

export function comparisonSummaries(
  rooms: Room[],
  scenarios: ScenarioRun[],
  view: HomeView,
): ComparisonSummary[] {
  const classic = filterComparisons(rooms, "comparisons").map(
    ({ room, run }): ComparisonSummary => ({
      roomId: room.id,
      runId: run.id,
      name: room.name,
      baseline: variantLabel(run.baseline),
      candidate: variantLabel(run.candidate),
      state: run.state,
      reviewState: run.reviewState,
      measured: !!run.comparison,
      differences: run.comparison?.mismatch_count ?? 0,
      totalCases: run.comparison?.cases.length ?? 0,
      executionProblems: run.comparison?.error_count ?? 0,
      unmetRequirements: null,
      revision: latestProposal(run)?.revision,
      decision: run.decisions.reduce<ComparisonSummary["decision"]>(
        (latest, item) =>
          !latest || item.version > latest.version ? item : latest,
        undefined,
      ),
      updatedAt: run.activity.at(-1)?.createdAt || run.createdAt,
      createdAt: run.createdAt,
      needsReview:
        run.reviewState !== "decided" &&
        run.reviewState !== "deferred" &&
        (!!run.comparison || run.state === "error"),
    }),
  );
  const suite = scenarios.map((run): ComparisonSummary => ({
    roomId: run.roomId,
    runId: run.id,
    name:
      rooms.find((room) => room.id === run.roomId)?.name || run.manifest.title,
    baseline: run.manifest.baseline,
    candidate: run.manifest.candidate,
    state: run.state,
    reviewState: run.reviewState,
    measured: !!run.comparison,
    differences: run.comparison?.mismatch_count ?? 0,
    totalCases: run.comparison?.cases.length ?? 0,
    executionProblems: run.comparison?.error_count ?? 0,
    unmetRequirements: run.comparison
      ? run.comparison.requirements.filter(
          (item) => item.baseline === "fail" || item.candidate === "fail",
        ).length
      : null,
    revision: run.revision || undefined,
    decision: run.decisions.find(
      (item) => item.version === run.decisionVersion,
    ),
    updatedAt: run.activity.at(-1)?.createdAt || run.createdAt,
    createdAt: run.createdAt,
    needsReview:
      run.reviewState !== "decided" &&
      run.reviewState !== "deferred" &&
      (!!run.comparison || run.state === "error"),
  }));
  return [...classic, ...suite]
    .filter(
      (item) =>
        view === "comparisons" ||
        (view === "history" ? !!item.decision : item.needsReview),
    )
    .sort((a, b) => {
      // Keep undecided work first, then deferred work, then approved decisions.
      const rank = (item: ComparisonSummary) =>
        item.reviewState === "decided"
          ? 2
          : item.reviewState === "deferred"
            ? 1
            : 0;
      const group = view === "comparisons" ? rank(a) - rank(b) : 0;
      return group || b.createdAt.localeCompare(a.createdAt);
    });
}
