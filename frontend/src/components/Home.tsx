/** Show all comparisons, those waiting for a decision, and earlier decisions. */
import { useRef, type CSSProperties } from "react";
import type { Room } from "../view-model";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import {
  comparisonSummaries,
  type ComparisonSummary,
} from "../comparison-summaries";
import { displayTime, type HomeView } from "../presentation";
import { Badge, Icon } from "./Primitives";
import {
  Cascade,
  Reveal,
  Section,
  Ticker,
  TiltCard,
} from "../motion/components";
import { useInView, useReducedMotion, useSignal } from "../motion";

const viewCopy = {
  comparisons: {
    title: "All comparisons",
    description:
      "Every saved run, from the first measured difference to the final decision.",
    scope:
      "Review queue shows the comparisons awaiting a decision. History shows approved decisions. Both remain here too.",
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
    title: "Review queue",
    description:
      "Review observed behavior and sign off on the intended policy, including matching results.",
    scope:
      "This is your active review list. Deferred comparisons stay in All comparisons and leave this queue; deferring creates no approved decision.",
    emptyTitle: "No unresolved comparisons",
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
  const all = comparisonSummaries(rooms, scenarioRuns, "comparisons");
  const copy = viewCopy[view];
  const totals = {
    runs: all.length,
    differences: all.reduce((sum, item) => sum + item.differences, 0),
    cases: all.reduce((sum, item) => sum + item.totalCases, 0),
    decided: all.filter((item) => item.reviewState === "decided").length,
  };

  return (
    <div className="home-page">
      <Section className="home-hero" as="header">
        <div className="home-hero-copy">
          <Reveal effect="rise">
            <span className="eyebrow">Migration review workspace</span>
          </Reveal>
          <Reveal effect="cascade" as="h1" className="home-title">
            <Cascade text={copy.title} />
          </Reveal>
          <Reveal effect="rise" delay={180}>
            <p className="home-lede">
              {view === "comparisons" ? (
                <>
                  Execute both versions on the same inputs. Find the exact day
                  the promise changed.{" "}
                  <em className="serif">Decide it together,</em> then keep the
                  test.
                </>
              ) : (
                copy.description
              )}
            </p>
          </Reveal>
          <Reveal effect="rise" delay={300} className="home-actions">
            <button
              className="button-primary home-cta"
              disabled={!ready}
              onClick={onNew}
            >
              <Icon name="plus" size={16} /> New comparison
            </button>
            <span className="home-scope">{copy.scope}</span>
          </Reveal>
          <Reveal
            effect="rise"
            delay={420}
            as="ul"
            className="readout-list home-readouts"
          >
            <li>
              <Ticker value={totals.runs} /> runs
            </li>
            <li>
              <Ticker value={totals.cases} /> executed inputs
            </li>
            <li>
              <Ticker value={totals.differences} /> differing cases
            </li>
            <li>
              <Ticker value={totals.decided} /> approved decisions
            </li>
          </Reveal>
        </div>
        <Reveal effect="focus-pull" delay={120} className="home-hero-stage">
          <DiffStage summaries={all} ready={ready} />
        </Reveal>
      </Section>

      {items.length ? (
        <Section className="comparison-list panel" aria-label={copy.title}>
          <div className="comparison-list-heading">
            {copy.columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
          <div className="stagger">
            {items.map((run, index) => (
              <Reveal
                effect="unseal"
                key={`${run.roomId}:${run.runId}`}
                style={{ "--i": index } as CSSProperties}
              >
                <ComparisonRow run={run} view={view} onOpen={onOpen} />
              </Reveal>
            ))}
          </div>
        </Section>
      ) : (
        <Section className="empty-state panel home-empty">
          <Reveal effect="deal-in">
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
                Choose a comparison example <Icon name="arrow" size={16} />
              </button>
            )}
          </Reveal>
        </Section>
      )}

      <Section className="home-flow" aria-label="How a review moves">
        <div className="stagger home-flow-steps">
          {[
            [
              "01",
              "Execute",
              "Both versions run on the same validated inputs. Outputs are measured, never assumed.",
            ],
            [
              "02",
              "Investigate",
              "An orchestrator and three specialists read code and evidence within a fixed budget.",
            ],
            [
              "03",
              "Decide together",
              "Two people review the conflict, publish revisions, and approve one exact revision.",
            ],
            [
              "04",
              "Keep the test",
              "Approval compiles the expectation into a runnable test and a reproducible export.",
            ],
          ].map(([mark, title, text], index) => (
            <Reveal
              effect="deal-in"
              key={mark}
              style={{ "--i": index } as CSSProperties}
              className="home-step"
            >
              <TiltCard className="home-step-card" strength={4}>
                <span className="readout">{mark}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </Section>
    </div>
  );
}

/**
 * The home centerpiece: two source panes, a sweeping measurement beam, and a flare where
 * they disagree. Counts shown are real; the scene itself is an illustration of the method.
 */
function DiffStage({
  summaries,
  ready,
}: {
  summaries: ComparisonSummary[];
  ready: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduced = useReducedMotion();
  const live = summaries.filter((item) => item.measured).at(0);
  useSignal((signal) => {
    const element = ref.current;
    if (!element || !["started", "published", "approved"].includes(signal))
      return;
    element.classList.remove("is-flaring");
    void element.offsetWidth;
    element.classList.add("is-flaring");
  });
  return (
    <div
      ref={ref}
      className={`diff-stage ${inView && !reduced ? "is-animating" : ""}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--px",
          `${((event.clientX - rect.left) / rect.width - 0.5).toFixed(3)}`,
        );
        event.currentTarget.style.setProperty(
          "--py",
          `${((event.clientY - rect.top) / rect.height - 0.5).toFixed(3)}`,
        );
      }}
      aria-hidden="true"
    >
      <div className="diff-stage-pane diff-stage-pane--baseline">
        <span className="diff-stage-label baseline-text">
          Baseline · legacy
        </span>
        <pre>{`if age_days <= 30:\n    return eligible(price)`}</pre>
        <span className="diff-stage-hash">v1 · pinned sha256</span>
      </div>
      <div className="diff-stage-axis">
        {[28, 29, 30, 31, 32].map((day) => (
          <span
            key={day}
            className={`diff-stage-tick ${day === 30 ? "is-boundary" : ""}`}
          >
            <i />
            <small>{day}</small>
          </span>
        ))}
        <span className="diff-stage-flare" />
      </div>
      <div className="diff-stage-pane diff-stage-pane--candidate">
        <span className="diff-stage-label candidate-text">
          Candidate · rewrite
        </span>
        <pre>{`if age_days < 30:\n    return eligible(price)`}</pre>
        <span className="diff-stage-hash">v2 · pinned sha256</span>
      </div>
      <span className="diff-stage-beam" />
      <div className="diff-stage-footer">
        <span className="readout">
          {ready
            ? live
              ? `latest measured · ${live.differences}/${live.totalCases} differ`
              : "no measured runs yet"
            : "connecting"}
        </span>
        <span className="diff-stage-note">
          Illustration of the method. Day 30 is the returns example boundary.
        </span>
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
      : status === "pass"
        ? "green"
        : run.differences > 0
          ? "amber"
          : "neutral";
  const ratio = run.totalCases ? run.differences / run.totalCases : 0;
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
        <small className="comparison-pair">
          <span className="baseline-text">{run.baseline}</span>
          <span className="comparison-pair-arrow" aria-hidden="true">
            <i />
          </span>
          <span className="candidate-text">{run.candidate}</span>
        </small>
      </span>
      <span className="comparison-observed">
        <Badge tone={tone}>{status}</Badge>
        {view !== "history" && run.measured && (
          <span className="comparison-meter" aria-hidden="true">
            <i style={{ "--ratio": ratio } as CSSProperties} />
          </span>
        )}
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
      <span className="muted comparison-time">
        {displayTime(
          view === "history" && decision ? decision.createdAt : run.updatedAt,
        )}
        <span className="row-arrow" aria-hidden="true">
          <Icon name="arrow" size={16} />
        </span>
      </span>
    </button>
  );
}
