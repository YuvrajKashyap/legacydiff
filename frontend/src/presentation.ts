/** Small helpers that choose labels and displayed records for classic returns. They do not change saved data. */
import type { Room, Run } from "./view-model";

export type HomeView = "comparisons" | "queue" | "history";
export function comparisonNotice(comparison: Run["comparison"]) {
  if (!comparison)
    return {
      title: "Waiting for measured results",
      description:
        "The worker will publish actual outputs here. Returning to this page does not start another run.",
    };
  if (comparison.error_count > 0)
    return {
      title: "Comparison contains execution errors",
      description:
        "A crash, timeout or invalid output prevents a valid comparison for that case. Inspect Measured cases; errors are never matches.",
    };
  return {
    title: "No mismatch to review",
    description:
      "No differences found in the tested cases. Matching outputs may share a defect; this does not establish correctness, security or universal equivalence.",
  };
}
export function filterComparisons(
  rooms: Room[],
  view: HomeView,
): Array<{ room: Room; run: Run }> {
  return rooms
    .flatMap((room) => room.runs.map((run) => ({ room, run })))
    .filter(
      ({ run }) =>
        view === "comparisons" ||
        (view === "history"
          ? run.reviewState === "decided"
          : run.reviewState !== "decided" &&
            (run.comparison?.mismatch_count ?? 0) > 0),
    )
    .sort((left, right) =>
      right.run.createdAt.localeCompare(left.run.createdAt),
    );
}
export function latestProposal(run: Run) {
  return run.proposals.reduce<Run["proposals"][number] | undefined>(
    (latest, proposal) =>
      !latest || proposal.revision > latest.revision ? proposal : latest,
    undefined,
  );
}
export function approvalIsStale(
  preview: { revision: number; decisionVersion: number },
  revision: number,
  decisionVersion: number,
  ready: boolean,
) {
  return (
    !ready ||
    preview.revision !== revision ||
    preview.decisionVersion !== decisionVersion
  );
}
export function variantLabel(id: string) {
  return (
    (
      {
        "legacy-v1": "Returns legacy v1",
        "rewrite-v2": "Returns rewrite v2",
        "corrected-v2": "Supplied corrected v2",
      } as Record<string, string>
    )[id] ?? id
  );
}
export function identityLabel(room: Room, identity: string) {
  return (
    room.members.find((member) => member.identity === identity)?.label ||
    identity.slice(0, 8)
  );
}
export function displayTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function evidenceExcerpt(evidence: {
  text: string;
  lineStart: number;
  lineEnd: number;
}) {
  return evidence.text
    .split("\n")
    .slice(evidence.lineStart - 1, evidence.lineEnd)
    .join("\n");
}
