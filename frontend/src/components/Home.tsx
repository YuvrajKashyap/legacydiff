/** Show all comparisons, those waiting for a decision, and earlier decisions. */
import type { Room } from "../view-model";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import {
  comparisonSummaries,
  type ComparisonSummary,
} from "../comparison-summaries";
import { displayTime, type HomeView } from "../presentation";
import { Badge } from "./Primitives";

const viewCopy = {
  comparisons: {
    title: "All comparisons",
    description:
      "Every saved run, from the first measured difference to the final decision.",
    scope:
      "Needs review shows the comparisons awaiting a decision. History shows approved decisions. Both remain here too.",
    emptyTitle: "No comparisons yet",
    emptyDescription:
      "Choose a bundled migration example, execute both versions, and review what changed.",
    columns: [
      "Comparison / source pair",
      "Observed outcome",
      "Review",
      "Last activity",
    ],
  },
  queue: {
    title: "Needs review",
    description:
      "Review observed behavior and sign off on the intended policy, including matching results.",
    scope:
      "This is your active review list. Deferred comparisons stay in All comparisons and leave this queue; deferring creates no approved decision.",
    emptyTitle: "No decisions waiting for review",
    emptyDescription:
      "Measured comparisons awaiting human sign-off appear here, even when outputs match. Deferred comparisons and runs still executing remain in All comparisons.",
    columns: [
      "Decision needed",
      "Observed outcome",
      "Proposal",
      "Last activity",
    ],
  },
  history: {
    title: "History",
    description:
      "Revisit approved expectations and the acceptance results they produced.",
    scope:
      "These are approved comparisons from All comparisons. A failed acceptance test is a recorded result, not an unfinished decision.",
    emptyTitle: "No approved decisions yet",
    emptyDescription:
      "Approve a reviewed proposal to record its exact expectations and acceptance-test result here.",
    columns: ["Approved comparison", "Validation", "Decision", "Approved"],
  },
} satisfies Record<
  HomeView,
  {
    title: string;
    description: string;
    scope: string;
    emptyTitle: string;
    emptyDescription: string;
    columns: string[];
  }
>;

export function Home({
  rooms,
  scenarioRuns,
  view,
  ready,
  onNew,
  onOpen,
}: {
  rooms: Room[];
  scenarioRuns: ScenarioRun[];
  view: HomeView;
  ready: boolean;
  onNew: () => void;
  onOpen: (roomId: string, runId: string) => void;
}) {
  const items = comparisonSummaries(rooms, scenarioRuns, view);
  const copy = viewCopy[view];

  return (
    <div className="home-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Migration review workspace</span>
          <h1>
            {copy.title} <Badge>{items.length}</Badge>
          </h1>
          <p>{copy.description}</p>
        </div>
        <button className="button-primary" disabled={!ready} onClick={onNew}>
          <span aria-hidden="true">+</span> New comparison
        </button>
      </header>
      <p className="muted small">{copy.scope}</p>
      {view === "queue" && items.length > 0 && (
        <p className="small">
          <strong>{items.length}</strong> comparisons need attention
        </p>
      )}
      {items.length ? (
        <section className="comparison-list" aria-label={copy.title}>
          <div className="comparison-list-heading">
            {copy.columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
          {items.map((run) => (
            <ComparisonRow
              key={`${run.roomId}:${run.runId}`}
              run={run}
              view={view}
              onOpen={onOpen}
            />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <div className="empty-diff" aria-hidden="true">
            <span>−</span>
            <span>+</span>
          </div>
          <h2>{ready ? copy.emptyTitle : "Connecting to your workspace"}</h2>
          <p>
            {ready
              ? copy.emptyDescription
              : "Restoring your identity and waiting for the authorized snapshot."}
          </p>
          {view === "comparisons" && (
            <button
              className="button-primary"
              disabled={!ready}
              onClick={onNew}
            >
              Choose a comparison example <span aria-hidden="true">→</span>
            </button>
          )}
        </section>
      )}
      <div className="workflow-note">
        <span>Execute</span>
        <i aria-hidden="true">→</i>
        <span>Investigate</span>
        <i aria-hidden="true">→</i>
        <span>Decide together</span>
        <i aria-hidden="true">→</i>
        <span>Keep an executable test</span>
      </div>
    </div>
  );
}

function ComparisonRow({
  run,
  view,
  onOpen,
}: {
  run: ComparisonSummary;
  view: HomeView;
  onOpen: (roomId: string, runId: string) => void;
}) {
  const decision = run.decision;
  const reviewLabel =
    run.reviewState === "deferred"
      ? "Deferred"
      : run.reviewState === "decided"
        ? "Approved"
        : "Needs decision";
  const observed = run.measured
    ? `${run.differences} / ${run.totalCases} differing cases`
    : run.state === "error"
      ? "Execution problem"
      : run.state === "cancelled"
        ? "Cancelled"
        : "Awaiting measured output";
  const issues = run.measured
    ? `${run.executionProblems} execution problems · ${run.unmetRequirements === null ? "Independent checks not recorded" : `${run.unmetRequirements} checks unmet on either version`}`
    : "";
  const status =
    view === "history"
      ? decision?.validation?.state || "No validation result yet"
      : observed;
  const tone =
    status === "error" ||
    status === "fail" ||
    run.executionProblems > 0 ||
    (run.unmetRequirements ?? 0) > 0
      ? "red"
      : run.differences > 0
        ? "amber"
        : "neutral";
  return (
    <button
      className="comparison-row"
      onClick={() => onOpen(run.roomId, run.runId)}
      aria-label={`${view === "queue" ? "Review" : "Open"} ${run.name}, ${status}`}
    >
      <span className="comparison-name">
        <strong>{run.name}</strong>
        {view === "queue" && (
          <small>{reviewLabel} · human policy sign-off required</small>
        )}
        <small>
          <span className="baseline-text">{run.baseline}</span>
          <span aria-hidden="true"> → </span>
          <span className="candidate-text">{run.candidate}</span>
        </small>
      </span>
      <span>
        <Badge tone={tone}>{status}</Badge>
        {view !== "history" && <small>{issues}</small>}
      </span>
      <span>
        {view === "queue" ? (
          <>
            {run.revision ? `Revision ${run.revision}` : "Not drafted"}
            <small>
              {run.revision ? "Review proposal" : "Draft a proposal"}
            </small>
          </>
        ) : view === "history" ? (
          <>
            {decision ? `Version ${decision.version}` : "—"}
            <small>
              {decision
                ? `Proposal r${decision.proposalRevision}`
                : "No decision record"}
            </small>
          </>
        ) : (
          <>
            {reviewLabel}
            <small>{run.measured ? "Policy review" : "Awaiting results"}</small>
          </>
        )}
      </span>
      <span className="muted">
        {displayTime(
          view === "history" && decision ? decision.createdAt : run.updatedAt,
        )}
        <span className="row-arrow" aria-hidden="true">
          ↗
        </span>
      </span>
    </button>
  );
}
