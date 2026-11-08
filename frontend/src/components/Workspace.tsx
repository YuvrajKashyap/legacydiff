/** Bring classic returns results, AI notes, decisions, and room members together on one screen. */
import { useState, type CSSProperties } from "react";
import type { LegacyDiffState, Room, Run } from "../view-model";
import {
  comparisonNotice,
  displayTime,
  latestProposal,
  variantLabel,
} from "../presentation";
import { emitSignal } from "../motion";
import { Reveal, Section, TiltCard } from "../motion/components";
import { Badge, ErrorNotice, Icon } from "./Primitives";
import { Output } from "./CaseTable";
import { ReviewPanel } from "./ReviewPanel";
import { SourcePanel } from "./SourcePanel";
import { InvestigationPanel } from "./InvestigationPanel";
import {
  EvidenceSection,
  MeasuredCases,
  ValidationHistory,
} from "./RunResults";

export function Workspace({
  room,
  run,
  state,
  onBack,
  onNew,
}: {
  room: Room;
  run: Run;
  state: LegacyDiffState;
  onBack: () => void;
  onNew: (candidate?: string) => void;
}) {
  const [tab, setTab] = useState<"finding" | "cases">("finding");
  const [filter, setFilter] = useState("all");
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const finding = run.comparison?.cases.find(
    (item) => item.state === "mismatch",
  );
  const proposal = latestProposal(run);
  const emptyComparison = comparisonNotice(run.comparison);
  const address = { roomId: room.id, runId: run.id };
  const visibleFinding =
    finding && (filter === "all" || run.reviewState === filter);
  const mayCancel = ["queued", "running", "cancelling"].includes(run.state);

  async function perform(operation: () => Promise<void>) {
    if (!state.ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      emitSignal("error");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({
        room: room.id,
        run: run.id,
      }).toString();
      await navigator.clipboard.writeText(url.href);
      emitSignal("copied");
      setNotice("Room link copied. New identities must request admission.");
    } catch {
      setNotice(
        "Copy this page URL to share the room. New identities must request admission.",
      );
    }
  }

  return (
    <div className="workspace-page">
      <button className="back-link" onClick={onBack}>
        Comparisons
      </button>
      <Section className="page-heading workspace-heading" as="header">
        <div>
          <Reveal effect="rise">
            <span className="eyebrow">Synthetic returns project</span>
          </Reveal>
          <Reveal effect="unseal" as="h1">
            {room.name}
          </Reveal>
          <Reveal effect="rise" delay={120} as="p" className="workspace-pair">
            <span className="baseline-text">{variantLabel(run.baseline)}</span>
            <span className="comparison-pair-arrow" aria-hidden="true">
              <i />
            </span>
            <span className="candidate-text">
              {variantLabel(run.candidate)}
            </span>
          </Reveal>
        </div>
        <Reveal effect="rise" delay={200} className="button-row">
          <button onClick={() => void share()}>
            <Icon name="link" size={15} /> Share review room
          </button>
          <button disabled={!state.ready} onClick={() => onNew(run.candidate)}>
            New run
          </button>
          {mayCancel && (
            <button
              disabled={!state.ready || busy || run.state === "cancelling"}
              onClick={() =>
                void perform(() =>
                  state.actions.cancelRun({
                    ...address,
                    requestId: crypto.randomUUID(),
                  }),
                )
              }
            >
              {run.state === "cancelling" ? "Cancelling…" : "Cancel analysis"}
            </button>
          )}
        </Reveal>
      </Section>
      <div className="workspace-meta">
        <Badge
          tone={
            run.state === "error"
              ? "red"
              : run.state === "completed"
                ? "green"
                : "neutral"
          }
        >
          {mayCancel && (
            <span className="live-dot live-dot--busy" aria-hidden="true" />
          )}
          {run.state}
        </Badge>
        <span className="mono">
          Run <code>{run.id.slice(0, 10)}</code>
        </span>
        <span>{displayTime(run.createdAt)}</span>
        <span>
          {run.modelId && run.modelId !== "deterministic"
            ? state.catalog?.models.find((item) => item.id === run.modelId)
                ?.label || run.modelId
            : "Without AI"}
        </span>
        <div className="participants">
          {room.members.map((member) => {
            const online = state.presence.some(
              (item) =>
                item.roomId === room.id && item.identity === member.identity,
            );
            return (
              <span
                className="participant"
                key={member.identity}
                title={`${member.label} · ${member.role}`}
              >
                <i className={online ? "online" : ""} />
                {member.label}
                {member.identity === state.identity ? " (you)" : ""}
                <small>{member.role}</small>
              </span>
            );
          })}
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <ErrorNotice message={error || run.diagnostic || ""} />
      {room.owner === state.identity &&
        state.requests
          .filter((item) => item.roomId === room.id && item.state === "pending")
          .map((request) => (
            <div className="admission" key={request.id}>
              <div>
                <span className="live-dot live-dot--warn" aria-hidden="true" />{" "}
                <strong>{request.label}</strong> requested access{" "}
                <small>Identity {request.identity.slice(0, 12)}</small>
              </div>
              <div className="button-row">
                <button
                  disabled={!state.ready || busy}
                  onClick={() =>
                    void perform(() =>
                      state.actions.admitMember({
                        requestId: request.id,
                        role: "engineer",
                      }),
                    )
                  }
                >
                  Admit as engineer
                </button>
                <button
                  className="button-primary"
                  disabled={!state.ready || busy}
                  onClick={() =>
                    void perform(() =>
                      state.actions.admitMember({
                        requestId: request.id,
                        role: "reviewer",
                      }),
                    )
                  }
                >
                  Admit as reviewer
                </button>
              </div>
            </div>
          ))}
      <InvestigationPanel run={run} />
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Comparison views"
        style={{ "--tab-index": tab === "finding" ? 0 : 1 } as CSSProperties}
      >
        <button
          role="tab"
          aria-selected={tab === "finding"}
          onClick={() => setTab("finding")}
        >
          Findings <Badge>{run.comparison?.mismatch_count ?? "—"}</Badge>
        </button>
        <button
          role="tab"
          aria-selected={tab === "cases"}
          onClick={() => setTab("cases")}
        >
          Cases <Badge>{run.comparison?.cases.length ?? "—"}</Badge>
        </button>
      </div>
      {tab === "cases" ? (
        <MeasuredCases run={run} />
      ) : (
        <div
          className={`finding-layout ${showDetail || !finding ? "finding-layout--detail" : ""}`}
        >
          <aside className="findings-sidebar">
            <label className="sr-only" htmlFor="finding-filter">
              Finding filter
            </label>
            <select
              id="finding-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All findings</option>
              <option value="needs_review">Needs decision</option>
              <option value="deferred">Deferred</option>
              <option value="decided">Approved</option>
            </select>
            {visibleFinding ? (
              <TiltCard
                as="button"
                strength={3}
                className="finding-card is-active"
                onClick={() => setShowDetail(true)}
              >
                <span className="eyebrow">Policy boundary</span>
                <strong>Day 30 return eligibility</strong>
                <p>{finding.differences.join(", ")}</p>
                <div>
                  <Badge
                    tone={
                      run.reviewState === "decided"
                        ? "green"
                        : run.reviewState === "deferred"
                          ? "neutral"
                          : "amber"
                    }
                  >
                    {run.reviewState === "deferred"
                      ? "Deferred"
                      : run.reviewState === "decided"
                        ? "Approved"
                        : "Needs decision"}
                  </Badge>
                  <small>
                    {proposal ? `r${proposal.revision}` : "No proposal"}
                  </small>
                </div>
                <small>
                  {run.evidence.length
                    ? `${run.evidence.length} evidence sources`
                    : "Evidence unavailable"}
                </small>
              </TiltCard>
            ) : (
              <p className="sidebar-empty">
                {!run.comparison
                  ? "Comparison is waiting for measured results."
                  : finding
                    ? "No findings in this filter."
                    : "No differences found in the tested cases."}
              </p>
            )}
            {Boolean(run.comparison?.error_count) && (
              <p className="notice notice--error">
                {run.comparison?.error_count} execution errors. Inspect Cases
                before drawing conclusions.
              </p>
            )}
          </aside>
          <main className="finding-detail">
            <button
              className="back-link mobile-only"
              onClick={() => setShowDetail(false)}
            >
              Back to findings
            </button>
            {finding ? (
              <>
                <Section className="finding-title">
                  <Reveal effect="rise">
                    <span className="eyebrow">Observed difference</span>
                  </Reveal>
                  <Reveal effect="focus-pull" as="h2" delay={60}>
                    One day. A different promise.
                  </Reveal>
                  <Reveal effect="rise" delay={160} as="p">
                    At day {finding.input.age_days}, the baseline and candidate
                    produce different return outcomes.
                  </Reveal>
                </Section>
                <div className="changed-fields">
                  Changed fields{" "}
                  {finding.differences.map((field) => (
                    <code key={field}>{field}</code>
                  ))}
                </div>
                <Section className="reproduce">
                  <div className="section-heading">
                    <h3>Reproduce</h3>
                    <Badge>Measured output</Badge>
                  </div>
                  <BoundaryAxis run={run} />
                  <Reveal effect="rise" className="input-summary">
                    <span>
                      Age <strong>{finding.input.age_days} days</strong>
                    </span>
                    <span>
                      Price <strong>{finding.input.price_cents} cents</strong>
                    </span>
                    <span>
                      Receipt{" "}
                      <strong>
                        {finding.input.has_receipt ? "Yes" : "No"}
                      </strong>
                    </span>
                    <span>
                      Final sale{" "}
                      <strong>{finding.input.final_sale ? "Yes" : "No"}</strong>
                    </span>
                  </Reveal>
                  <div className="result-pair">
                    <Reveal effect="deal-in" delay={80}>
                      <TiltCard
                        className="result-panel result-panel--baseline"
                        strength={4}
                      >
                        <span className="eyebrow">Baseline</span>
                        <h4>{variantLabel(run.baseline)}</h4>
                        <Output value={finding.baseline.output} />
                        <small>
                          {finding.baseline.duration_ms.toFixed(1)} ms ·{" "}
                          <code title={finding.baseline.sha256}>
                            {finding.baseline.sha256.slice(0, 12)}
                          </code>
                        </small>
                      </TiltCard>
                    </Reveal>
                    <Reveal effect="deal-in" delay={200}>
                      <TiltCard
                        className="result-panel result-panel--candidate"
                        strength={4}
                      >
                        <span className="eyebrow">Candidate</span>
                        <h4>{variantLabel(run.candidate)}</h4>
                        <Output value={finding.candidate.output} />
                        <small>
                          {finding.candidate.duration_ms.toFixed(1)} ms ·{" "}
                          <code title={finding.candidate.sha256}>
                            {finding.candidate.sha256.slice(0, 12)}
                          </code>
                        </small>
                      </TiltCard>
                    </Reveal>
                  </div>
                  <details>
                    <summary>Exact input JSON</summary>
                    <pre>{JSON.stringify(finding.input, null, 2)}</pre>
                  </details>
                  <details>
                    <summary>Pinned source code</summary>
                    <div className="source-pair">
                      <SourcePanel
                        side="baseline"
                        variant={run.sourceVariants?.find(
                          (item) => item.id === run.baseline,
                        )}
                      />
                      <SourcePanel
                        side="candidate"
                        variant={run.sourceVariants?.find(
                          (item) => item.id === run.candidate,
                        )}
                      />
                    </div>
                  </details>
                </Section>
                <EvidenceSection
                  room={room}
                  run={run}
                  state={state}
                  busy={busy}
                  perform={perform}
                />
                <section className="rule-section">
                  <h3>Unresolved rule</h3>
                  <p>
                    <strong>Through day 30</strong> includes the boundary.{" "}
                    <strong>Before day 30</strong> excludes it. The old
                    implementation does not automatically settle this conflict.
                  </p>
                </section>
                <ReviewPanel
                  key={run.id}
                  room={room}
                  run={run}
                  identity={state.identity}
                  ready={state.ready}
                  catalog={state.catalog}
                  actions={state.actions}
                />
              </>
            ) : (
              <div className="detail-empty">
                <h2>{emptyComparison.title}</h2>
                <p>{emptyComparison.description}</p>
              </div>
            )}
            <ValidationHistory
              room={room}
              run={run}
              state={state}
              busy={busy}
              perform={perform}
              onNew={onNew}
            />
          </main>
        </div>
      )}
    </div>
  );
}

/**
 * The classic centerpiece: measured cases laid along the day axis.
 * Each tick shows what both versions actually returned; the flare marks where they disagree.
 */
function BoundaryAxis({ run }: { run: Run }) {
  const cases = (run.comparison?.cases ?? [])
    .filter((item) => item.input.has_receipt && !item.input.final_sale)
    .sort((a, b) => a.input.age_days - b.input.age_days);
  if (cases.length < 2) return null;
  return (
    <Reveal
      effect="curtain"
      className="boundary-axis"
      aria-label="Measured eligibility by day"
    >
      <span className="boundary-axis-label baseline-text">
        Baseline eligible
      </span>
      <div className="boundary-axis-track">
        {cases.map((item) => (
          <div
            key={item.id}
            className={`boundary-day ${item.state === "mismatch" ? "is-mismatch" : ""} ${item.state === "error" ? "is-error" : ""}`}
            title={`${item.id}: ${item.state}`}
          >
            <span
              className={`boundary-pip ${item.baseline.output?.eligible ? "is-on baseline" : ""}`}
            />
            <strong>Day {item.input.age_days}</strong>
            <span
              className={`boundary-pip ${item.candidate.output?.eligible ? "is-on candidate" : ""}`}
            />
            {item.state === "mismatch" && (
              <i className="boundary-flare" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <span className="boundary-axis-label candidate-text">
        Candidate eligible
      </span>
    </Reveal>
  );
}
