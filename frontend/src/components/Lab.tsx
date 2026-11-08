import { AiText } from "./AiText";
/** Show the real AI work behind a comparison, including calls and tools, without inventing progress. */
import { useState } from "react";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";
import { displayTime } from "../presentation";
import { InvestigationHistory } from "./InvestigationHistory";
import { Badge, ErrorNotice } from "./Primitives";
import "../styles/lab.css";

type TraceEvent = NonNullable<ScenarioRun["aiTrace"]>[number];
type Role = TraceEvent["role"];
const roles: Array<{ id: Role; name: string; purpose: string; mark: string }> =
  [
    {
      id: "orchestrator",
      name: "Orchestrator",
      purpose: "Brings the specialists' findings together",
      mark: "01",
    },
    {
      id: "behavior",
      name: "Behavior specialist",
      purpose: "Investigates what changed between versions",
      mark: "02",
    },
    {
      id: "policy",
      name: "Policy specialist",
      purpose: "Reads the evidence for intended behavior",
      mark: "03",
    },
    {
      id: "regression",
      name: "Regression specialist",
      purpose: "Suggests examples that protect the decision",
      mark: "04",
    },
  ];

export function Lab({
  state,
  selectedRunId,
  onSelect,
  onOpen,
}: {
  state: LegacyDiffState;
  selectedRunId: string;
  onSelect: (roomId: string, runId: string) => void;
  onOpen: (roomId: string, runId: string) => void;
}) {
  const run =
    state.scenarioRuns.find((item) => item.id === selectedRunId) ||
    (!selectedRunId ? state.scenarioRuns[0] : undefined);
  const [chosenModel, setChosenModel] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("orchestrator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState<{
    runId: string;
    modelId: string;
    previousAttemptId?: string;
  } | null>(null);
  const models = state.catalog?.models || [];
  const draftModelId =
    chosenModel ||
    models.find((item) => item.ready && item.id.includes("ultra"))?.id ||
    models.find((item) => item.ready)?.id ||
    models[0]?.id ||
    "";
  const title = run
    ? state.rooms.find((room) => room.id === run.roomId)?.name ||
      run.manifest.title
    : "Choose a saved comparison";
  const currentAttempt = run?.investigationAttempts?.at(-1);
  const trace = currentAttempt?.trace || run?.aiTrace || [];
  const attemptState = currentAttempt?.state || run?.investigationState;
  const awaitingAttempt =
    !!run &&
    submittedRequest?.runId === run.id &&
    submittedRequest.previousAttemptId === currentAttempt?.id;
  const active =
    attemptState === "queued" ||
    attemptState === "running" ||
    attemptState === "cancelling";
  const alreadyStarted =
    !!run &&
    (!!run.investigationState ||
      !!run.investigation ||
      !!run.withAi ||
      trace.length > 0 ||
      submittedRequest?.runId === run.id);
  // A saved investigation keeps its own model even when another comparison uses a different one.
  const recordedRequest =
    !!run &&
    (!!run.withAi ||
      !!run.investigationState ||
      !!run.investigation ||
      trace.length > 0);
  const requestedModelId = recordedRequest
    ? currentAttempt?.modelId || run?.modelId || ""
    : submittedRequest?.runId === run?.id
      ? submittedRequest?.modelId || ""
      : "";
  const attemptCount =
    run?.investigationAttempts?.length || (alreadyStarted ? 1 : 0);
  const retryable = ["failed", "partial", "completed", "cancelled"].includes(
    attemptState || "",
  );
  const modelId = active ? requestedModelId : draftModelId;
  const model = models.find((item) => item.id === modelId);
  const readyToInvestigate =
    state.ready &&
    !!run?.comparison &&
    run.state === "completed" &&
    !!model?.ready &&
    (!alreadyStarted || retryable) &&
    !active &&
    !awaitingAttempt &&
    attemptCount < 10 &&
    !busy;
  const summary = readSummary(
    currentAttempt ? currentAttempt.outcome : run?.investigation,
  );
  const modelEvents = trace.filter((event) => event.kind === "model");
  // Only completed call details name an actual returned model. A request alone is not proof.
  const tracedModels = [
    ...new Set(
      modelEvents
        .filter((event) => event.state === "completed")
        .flatMap((event) => {
          const match = event.detail?.match(/^([^;\s]+); \d+(?:\.\d+)? ms;/);
          return match ? [match[1]] : [];
        }),
    ),
  ];
  const actualModels = summary.models.length ? summary.models : tracedModels;
  const liveCallCounts = modelEvents.length
    ? `${modelEvents.filter((event) => event.state === "completed").length} completed · ${modelEvents.filter((event) => event.state === "running").length} ${run?.investigationState === "running" ? "running" : "last recorded running"} · ${modelEvents.filter((event) => event.state === "failed").length} failed`
    : "Not recorded";
  const selectedEvents = trace.filter((event) => event.role === selectedRole);
  const role = roles.find((item) => item.id === selectedRole)!;
  async function investigate() {
    if (!run || !readyToInvestigate) return;
    setBusy(true);
    setError("");
    try {
      // This uses a saved comparison. It never creates another comparison or approves a policy.
      await state.scenarioActions.investigate({
        roomId: run.roomId,
        runId: run.id,
        modelId,
        requestId: crypto.randomUUID(),
      });
      setSubmittedRequest({
        runId: run.id,
        modelId,
        previousAttemptId: currentAttempt?.id,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!run || !active || !state.ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await state.scenarioActions.cancel({
        roomId: run.roomId,
        runId: run.id,
        requestId: crypto.randomUUID(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lab-page">
      <header className="lab-heading">
        <div>
          <span className="eyebrow">Inside the investigation</span>
          <h1>
            The Lab
            <span className="lab-heading-dot" aria-hidden="true" />
          </h1>
          <p>
            Follow the AI's work. Inspect the evidence. Keep the decision yours.
          </p>
        </div>
        <span className="lab-index">
          4 roles
          <br />
          <small>one human decision</small>
        </span>
      </header>
      <section className="lab-controls" aria-label="Investigation controls">
        <div className="lab-choice">
          <label htmlFor="lab-comparison">Saved comparison</label>
          <select
            id="lab-comparison"
            value={run?.id || ""}
            disabled={busy}
            onChange={(event) => {
              const next = state.scenarioRuns.find(
                (item) => item.id === event.target.value,
              );
              if (next) {
                setSelectedRole("orchestrator");
                setError("");
                onSelect(next.roomId, next.id);
              }
            }}
          >
            <option value="" disabled>
              Choose a comparison
            </option>
            {state.scenarioRuns.map((item) => (
              <option key={item.id} value={item.id}>
                {state.rooms.find((room) => room.id === item.roomId)?.name ||
                  item.manifest.title}
              </option>
            ))}
          </select>
          <small>
            Uses existing measured results. No new comparison is created.
          </small>
        </div>
        <div className="lab-choice">
          <label htmlFor="lab-model">Investigation model</label>
          <select
            id="lab-model"
            value={modelId}
            disabled={busy || active || awaitingAttempt}
            onChange={(event) => setChosenModel(event.target.value)}
          >
            {active && !models.some((item) => item.id === modelId) && (
              <option value={modelId}>
                {modelId || "Requested model not recorded"}
              </option>
            )}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.ready ? "" : " · unavailable"}
              </option>
            ))}
          </select>
          <small>
            {active
              ? "Model saved with this investigation"
              : model?.ready
                ? "Available for a new investigation"
                : model?.reason || "Waiting for model availability"}
          </small>
        </div>
        <div className="lab-start">
          <button
            className="button-primary"
            disabled={!readyToInvestigate}
            onClick={() => void investigate()}
          >
            {busy
              ? "Sending request…"
              : active
                ? "Investigation in progress"
                : awaitingAttempt
                  ? "Waiting for saved attempt"
                  : attemptCount >= 10
                    ? "Ten-attempt limit reached"
                    : retryable
                      ? "Run another investigation"
                      : alreadyStarted
                        ? "Investigation already requested"
                        : "Investigate this comparison"}
          </button>
          {active && (
            <button
              disabled={!state.ready || busy || attemptState === "cancelling"}
              onClick={() => void cancel()}
            >
              {attemptState === "cancelling"
                ? "Cancellation requested"
                : "Cancel investigation"}
            </button>
          )}
        </div>
      </section>
      <ErrorNotice message={error || currentAttempt?.diagnostic || ""} />
      {!run ? (
        <section className="empty-state">
          <h2>
            {selectedRunId
              ? "Comparison unavailable"
              : "Start with a comparison"}
          </h2>
          <p>
            {selectedRunId
              ? "The selected comparison is not in the current authorized records."
              : "Create a comparison and execute its examples first. Then choose it here to investigate the measured behavior."}
          </p>
        </section>
      ) : (
        <>
          <div className="lab-run-heading">
            <div>
              <h2>{title}</h2>
              <p>
                {run.manifest.title} ·{" "}
                {run.comparison
                  ? `${run.comparison.cases.length} measured examples`
                  : "Waiting for measured results"}
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => onOpen(run.roomId, run.id)}
            >
              Open comparison & review →
            </button>
          </div>
          <div className="lab-state-line" role="status">
            <Badge
              tone={
                run.investigationState === "failed"
                  ? "red"
                  : active
                    ? "teal"
                    : "neutral"
              }
            >
              {attemptState ||
                (alreadyStarted
                  ? "Requested · waiting for recorded activity"
                  : "Not started")}
            </Badge>
            <span>
              {alreadyStarted
                ? `Current attempt ${attemptCount} of 10. Earlier attempts stay saved. A finished, failed or cancelled investigation can be run again, up to ten attempts.`
                : "Nothing starts until you choose Investigate."}
            </span>
          </div>
          <section className="lab-map" aria-label="AI team and recorded work">
            <div className="lab-map-caption">
              <span>TEAM MAP</span>
              <span>Choose a role to inspect its work</span>
            </div>
            <div className="lab-tree">
              <div className="lab-root">
                <AgentNode
                  role={roles[0]}
                  events={trace}
                  selected={selectedRole === "orchestrator"}
                  active={active}
                  onSelect={() => setSelectedRole("orchestrator")}
                />
              </div>
              <div
                className={`lab-branches ${run.investigationState === "running" && trace.some((event) => event.state === "running") ? "lab-branches--running" : ""}`}
              >
                {roles.slice(1).map((item) => (
                  <div
                    className={`lab-branch ${run.investigationState === "running" && trace.some((event) => event.role === item.id && event.state === "running") ? "is-running" : ""}`}
                    key={item.id}
                  >
                    <AgentNode
                      role={item}
                      events={trace}
                      selected={selectedRole === item.id}
                      active={active}
                      onSelect={() => setSelectedRole(item.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <p className="lab-map-note">
              Three fixed specialists, each with its own conversation context.
              Model calls and tools are work inside those roles, not additional
              agents.
            </p>
          </section>
          <div className="lab-detail-grid">
            <section className="lab-panel">
              <div className="lab-panel-heading">
                <div>
                  <span className="eyebrow">Selected role</span>
                  <h2>{role.name}</h2>
                </div>
                <span className="lab-event-count">
                  {selectedEvents.length} recorded events
                </span>
              </div>
              <p className="muted">{role.purpose}.</p>
              {selectedEvents.length ? (
                <ol className="lab-events">
                  {selectedEvents.map((event) => (
                    <TraceRow
                      key={event.id}
                      event={event}
                      parent={trace.find((item) => item.id === event.parentId)}
                    />
                  ))}
                </ol>
              ) : (
                <p className="lab-empty">
                  No work recorded for this role yet. This card shows its
                  assigned responsibility, not completed work.
                </p>
              )}
            </section>
            <section className="lab-panel lab-summary">
              <span className="eyebrow">Recorded outcome</span>
              <h2>What the team found</h2>
              {summary.text ? (
                <AiText className="lab-summary-text" text={summary.text} />
              ) : (
                <p className="lab-empty">
                  No final summary has been recorded. Follow individual calls to
                  see available progress.
                </p>
              )}
              <dl>
                <div>
                  <dt>Requested model</dt>
                  <dd>
                    {requestedModelId ||
                      (alreadyStarted ? "Not recorded" : "Not requested")}
                  </dd>
                </div>
                <div>
                  <dt>Actual models</dt>
                  <dd>
                    {actualModels.length
                      ? actualModels.join(", ")
                      : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Model calls</dt>
                  <dd>
                    {summary.calls === null ? liveCallCounts : summary.calls}
                  </dd>
                </div>
              </dl>
              <p className="lab-boundary">
                AI can explain evidence and suggest expectations. It cannot
                approve the policy or turn a suggestion into a passing result.
              </p>
            </section>
          </div>
          <InvestigationHistory run={run} />
          <details className="lab-panel lab-timeline">
            <summary>
              Full activity record <span>{trace.length} events</span>
            </summary>
            <p className="muted">
              Events are shown in the order they were created. Each row shows
              the latest recorded state for that call.
            </p>
            {trace.length ? (
              <ol className="lab-events">
                {trace.map((event) => (
                  <TraceRow
                    key={event.id}
                    event={event}
                    parent={trace.find((item) => item.id === event.parentId)}
                  />
                ))}
              </ol>
            ) : (
              <p>No activity recorded yet.</p>
            )}
          </details>
        </>
      )}
      <section
        className="lab-guide"
        aria-label="How investigation fits the review"
      >
        <article>
          <span>01 / OBSERVE</span>
          <h3>Outputs</h3>
          <p>
            What the two source versions actually returned for the same input.
          </p>
        </article>
        <article>
          <span>02 / CHECK</span>
          <h3>Requirements</h3>
          <p>
            Rules each version must meet. Code can run without crashing and
            still break a rule.
          </p>
        </article>
        <article>
          <span>03 / DECIDE</span>
          <h3>Approval</h3>
          <p>
            A human chooses the intended policy, previews exact examples, and
            approves their tests.
          </p>
        </article>
      </section>
      <p className="lab-footnote">
        Execution is limited to reviewed bundled sources. An investigation may
        inspect up to 20 existing cases, make 24 tool calls and 8 model calls,
        with one extra call for a correction. The time limit is 6 minutes. This
        view shows public activity and summaries, not private model reasoning.
      </p>
    </div>
  );
}

function AgentNode({
  role,
  events,
  selected,
  active,
  onSelect,
}: {
  role: (typeof roles)[number];
  events: TraceEvent[];
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const ownEvents = events.filter((event) => event.role === role.id);
  const agent = ownEvents.find((event) => event.kind === "agent");
  const status =
    agent?.state === "running" && !active
      ? "Last recorded: running"
      : agent?.state ||
        (ownEvents.length ? "Activity recorded" : "Not started");
  return (
    <button
      className={`lab-agent ${selected ? "is-selected" : ""} ${active && agent?.state === "running" ? "is-running" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${role.name}, ${status}`}
    >
      <span className="lab-agent-top">
        <span className="lab-agent-number">{role.mark}</span>
        <span className="lab-agent-state">{status}</span>
      </span>
      <strong>{role.name}</strong>
      <span className="lab-agent-purpose">{role.purpose}</span>
      <span className="lab-agent-footer">
        {ownEvents.filter((event) => event.kind === "model").length} model calls
        · {ownEvents.filter((event) => event.kind === "tool").length} tool calls{" "}
        <span aria-hidden="true">↗</span>
      </span>
    </button>
  );
}

function TraceRow({
  event,
  parent,
}: {
  event: TraceEvent;
  parent?: TraceEvent;
}) {
  return (
    <li className={`lab-event lab-event--${event.state}`}>
      <details>
        <summary>
          <span className="lab-event-kind">{event.kind}</span>
          <strong>{event.label}</strong>
          <Badge tone={event.state === "failed" ? "red" : "neutral"}>
            {event.state}
          </Badge>
        </summary>
        <div className="lab-event-detail">
          <AiText text={event.detail || "No further public detail recorded."} />
          <small>
            {event.role} · {displayTime(event.createdAt)}
            {parent && ` · Part of ${parent.label}`}
          </small>
        </div>
      </details>
    </li>
  );
}

// Read only the fields the page can explain. A missing result is never treated as success.
function readSummary(raw?: string): {
  text: string;
  models: string[];
  calls: number | null;
} {
  try {
    const value: unknown = JSON.parse(raw || "null");
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { text: "", models: [], calls: null };
    const record = value as Record<string, unknown>;
    // Show the actual combined finding first; call counts remain in the details below.
    const synthesis = Array.isArray(record.roles)
      ? record.roles.find(
          (role) =>
            role?.role === "orchestrator" &&
            role?.state === "completed" &&
            typeof role?.summary === "string",
        )
      : undefined;
    return {
      text:
        synthesis?.summary ||
        (typeof record.summary === "string" ? record.summary : ""),
      models: Array.isArray(record.actualModelIds)
        ? record.actualModelIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      calls:
        typeof record.calls === "number" && Number.isFinite(record.calls)
          ? record.calls
          : null,
    };
  } catch {
    return { text: "", models: [], calls: null };
  }
}
