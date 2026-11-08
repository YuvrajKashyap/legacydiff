/** Show the real AI work behind a comparison, including calls and tools, without inventing progress. */
import { useState, type CSSProperties } from "react";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";
import { displayTime } from "../presentation";
import { AiText } from "./AiText";
import { InvestigationHistory } from "./InvestigationHistory";
import {
  OrchestrationGraph,
  type GraphActivity,
  type GraphRole,
} from "./OrchestrationGraph";
import { Badge, ErrorNotice, Icon } from "./Primitives";
import { Cascade, Reveal, Section, Ticker } from "../motion/components";
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
  // Graph activity comes only from recorded trace rows; a role with nothing recorded stays idle.
  const graphActivity = Object.fromEntries(
    roles.map((item) => {
      const own = trace.filter((event) => event.role === item.id);
      const agent = own.find((event) => event.kind === "agent");
      const recordedState = agent?.state;
      const graphState: GraphActivity["state"] =
        recordedState === "running" && !active
          ? "stopped"
          : recordedState === "running"
            ? "running"
            : recordedState === "failed"
              ? "failed"
              : recordedState === "completed"
                ? "completed"
                : own.length
                  ? "queued"
                  : "idle";
      return [
        item.id,
        {
          state: graphState,
          modelCalls: own.filter((event) => event.kind === "model").length,
          toolCalls: own.filter((event) => event.kind === "tool").length,
        } satisfies GraphActivity,
      ];
    }),
  ) as Record<GraphRole, GraphActivity>;
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
      <Section className="lab-heading" as="header">
        <div>
          <Reveal effect="rise">
            <span className="eyebrow">Inside the investigation</span>
          </Reveal>
          <Reveal effect="cascade" as="h1">
            <Cascade text="The Lab" />
            <span
              className={`lab-heading-dot ${active ? "is-live" : ""}`}
              aria-hidden="true"
            />
          </Reveal>
          <Reveal effect="rise" delay={200}>
            <p>
              Follow the AI's work. Inspect the evidence.{" "}
              <em className="serif">Keep the decision yours.</em>
            </p>
          </Reveal>
        </div>
        <Reveal effect="focus-pull" delay={260} className="lab-index">
          <span className="lab-index-number">4</span>
          <span>
            roles
            <br />
            <small>one human decision</small>
          </span>
        </Reveal>
      </Section>
      <Section
        className="lab-controls panel"
        aria-label="Investigation controls"
      >
        <Reveal effect="rise" className="lab-choice">
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
        </Reveal>
        <Reveal effect="rise" delay={90} className="lab-choice">
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
        </Reveal>
        <Reveal effect="rise" delay={180} className="lab-start">
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
        </Reveal>
      </Section>
      <ErrorNotice message={error || currentAttempt?.diagnostic || ""} />
      {!run ? (
        <Section className="empty-state panel">
          <Reveal effect="deal-in">
            <h2>
              {selectedRunId
                ? "Comparison unavailable"
                : "Start with a comparison"}
            </h2>
            <p className="muted">
              {selectedRunId
                ? "The selected comparison is not in the current authorized records."
                : "Create a comparison and execute its examples first. Then choose it here to investigate the measured behavior."}
            </p>
          </Reveal>
          <OrchestrationGraph
            mode="illustrative"
            caption="Illustration of the fixed team shape. No activity is shown until an investigation runs."
          />
        </Section>
      ) : (
        <>
          <Section className="lab-run-heading">
            <Reveal effect="unseal">
              <h2>{title}</h2>
              <p>
                {run.manifest.title} ·{" "}
                {run.comparison
                  ? `${run.comparison.cases.length} measured examples`
                  : "Waiting for measured results"}
              </p>
            </Reveal>
            <button
              className="text-button lab-open"
              onClick={() => onOpen(run.roomId, run.id)}
            >
              Open comparison & review <Icon name="arrow" size={14} />
            </button>
          </Section>
          <div className="lab-state-line" role="status">
            <Badge
              tone={
                run.investigationState === "failed"
                  ? "red"
                  : active
                    ? "teal"
                    : attemptState === "completed"
                      ? "green"
                      : "neutral"
              }
            >
              {active && (
                <span className="live-dot live-dot--busy" aria-hidden="true" />
              )}
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
          <Section className="lab-map" aria-label="AI team and recorded work">
            <div className="lab-map-caption">
              <span className="readout">Team map</span>
              <span>Choose a role to inspect its work</span>
            </div>
            <Reveal effect="focus-pull">
              <OrchestrationGraph
                mode="live"
                activity={graphActivity}
                selected={selectedRole}
                onSelect={(next) => setSelectedRole(next)}
                caption={
                  trace.length
                    ? `${trace.length} recorded events · ${modelEvents.length} model calls`
                    : "No activity recorded yet"
                }
              />
            </Reveal>
            <div className="lab-role-strip stagger">
              {roles.map((item, index) => {
                const own = trace.filter((event) => event.role === item.id);
                const agent = own.find((event) => event.kind === "agent");
                const status =
                  agent?.state === "running" && !active
                    ? "Last recorded: running"
                    : agent?.state ||
                      (own.length ? "Activity recorded" : "Not started");
                return (
                  <Reveal
                    effect="deal-in"
                    key={item.id}
                    style={{ "--i": index } as CSSProperties}
                  >
                    <button
                      className={`lab-agent ${selectedRole === item.id ? "is-selected" : ""} ${active && agent?.state === "running" ? "is-running" : ""}`}
                      onClick={() => setSelectedRole(item.id)}
                      aria-pressed={selectedRole === item.id}
                      aria-label={`${item.name}, ${status}`}
                    >
                      <span className="lab-agent-top">
                        <span className="lab-agent-number">{item.mark}</span>
                        <span className="lab-agent-state">{status}</span>
                      </span>
                      <strong>{item.name}</strong>
                      <span className="lab-agent-purpose">{item.purpose}</span>
                      <span className="lab-agent-footer">
                        <span>
                          <Ticker
                            value={
                              own.filter((event) => event.kind === "model")
                                .length
                            }
                          />{" "}
                          model
                        </span>
                        <span>
                          <Ticker
                            value={
                              own.filter((event) => event.kind === "tool")
                                .length
                            }
                          />{" "}
                          tool
                        </span>
                      </span>
                    </button>
                  </Reveal>
                );
              })}
            </div>
            <p className="lab-map-note">
              Three fixed specialists, each with its own conversation context.
              Model calls and tools are work inside those roles, not additional
              agents.
            </p>
          </Section>
          <Section className="lab-detail-grid">
            <Reveal effect="unseal" as="section" className="lab-panel panel">
              <div className="lab-panel-heading">
                <div>
                  <span className="eyebrow">Selected role</span>
                  <h2 key={role.id} className="lab-role-title">
                    {role.name}
                  </h2>
                </div>
                <span className="lab-event-count readout">
                  {selectedEvents.length} recorded events
                </span>
              </div>
              <p className="muted">{role.purpose}.</p>
              {selectedEvents.length ? (
                <ol className="lab-events" key={role.id}>
                  {selectedEvents.map((event, index) => (
                    <TraceRow
                      key={event.id}
                      index={index}
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
            </Reveal>
            <Reveal
              effect="unseal"
              delay={140}
              as="section"
              className="lab-panel lab-summary panel"
            >
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
            </Reveal>
          </Section>
          <InvestigationHistory run={run} />
          <details className="lab-panel lab-timeline panel">
            <summary>
              Full activity record <span>{trace.length} events</span>
            </summary>
            <p className="muted">
              Events are shown in the order they were created. Each row shows
              the latest recorded state for that call.
            </p>
            {trace.length ? (
              <ol className="lab-events">
                {trace.map((event, index) => (
                  <TraceRow
                    key={event.id}
                    index={index}
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
      <Section
        className="lab-guide stagger"
        aria-label="How investigation fits the review"
      >
        {[
          [
            "01 / Observe",
            "Outputs",
            "What the two source versions actually returned for the same input.",
          ],
          [
            "02 / Check",
            "Requirements",
            "Rules each version must meet. Code can run without crashing and still break a rule.",
          ],
          [
            "03 / Decide",
            "Approval",
            "A human chooses the intended policy, previews exact examples, and approves their tests.",
          ],
        ].map(([mark, heading, text], index) => (
          <Reveal
            effect="blinds"
            as="article"
            key={mark}
            style={{ "--i": index } as CSSProperties}
          >
            <span className="readout">{mark}</span>
            <h3>{heading}</h3>
            <p>{text}</p>
          </Reveal>
        ))}
      </Section>
      <p className="lab-footnote">
        Execution is limited to reviewed bundled sources. An investigation may
        inspect up to 20 existing cases, make 24 tool calls and 8 model calls,
        with one extra call for a correction. The time limit is 6 minutes. This
        view shows public activity and summaries, not private model reasoning.
      </p>
    </div>
  );
}

function TraceRow({
  event,
  parent,
  index,
}: {
  event: TraceEvent;
  parent?: TraceEvent;
  index: number;
}) {
  return (
    <li
      className={`lab-event lab-event--${event.state} lab-event--${event.kind}`}
      style={{ "--i": index } as CSSProperties}
    >
      <details>
        <summary>
          <span className="lab-event-kind">{event.kind}</span>
          <strong>{event.label}</strong>
          <Badge
            tone={
              event.state === "failed"
                ? "red"
                : event.state === "running"
                  ? "teal"
                  : "neutral"
            }
          >
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
