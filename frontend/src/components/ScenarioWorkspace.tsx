import { ComparisonNextStep } from "./ComparisonNextStep";
/** Show scenario evidence, keep private drafts, and preview the exact decision before saving it. */
import {
  MeasuredCases,
  OutcomeGuide,
  ScenarioInvestigation,
  IndependentRequirements,
} from "./ScenarioResults";
import { CaseChat } from "./CaseChat";
import { useEffect, useState } from "react";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";
import { displayTime } from "../presentation";
import { Badge, Dialog, ErrorNotice } from "./Primitives";
import { emitSignal } from "../motion";
import { Reveal } from "../motion/components";

type Preview = {
  revision: number;
  decisionVersion: number;
  policyId: string;
  rationale: string;
  evidenceIds: string[];
};
const json = (value: unknown) => JSON.stringify(value, null, 2);

type WorkspaceProps = {
  run: ScenarioRun;
  state: LegacyDiffState;
  onBack: () => void;
  onSelectVersion?: (id: string) => void;
};

export function ScenarioWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState(props.run.id);
  const selected =
    props.state.scenarioRuns.find((item) => item.id === selectedId) ||
    props.run;
  // Choosing a saved version switches the whole ticket, including its drafts and approval target.
  return (
    <VersionWorkspace
      key={`${props.state.identity}:${selected.id}`}
      {...props}
      run={selected}
      onSelectVersion={(id) => {
        setSelectedId(id);
        props.onSelectVersion?.(id);
      }}
    />
  );
}

function VersionWorkspace({
  run,
  state,
  onBack,
  onSelectVersion,
}: WorkspaceProps & { onSelectVersion: (id: string) => void }) {
  // Keep unfinished edits when new server data arrives or another reviewer makes a change.
  const draftKey = `legacydiff.scenarioDraft:${state.identity}:${run.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (
        saved &&
        typeof saved.rationale === "string" &&
        typeof saved.policyId === "string" &&
        Array.isArray(saved.evidenceIds)
      )
        return saved as {
          policyId: string;
          rationale: string;
          evidenceIds: string[];
        };
    } catch {
      /* If this browser cannot read its saved draft, start a fresh draft without changing the room. */
    }
    return {
      policyId: run.policyId || "",
      rationale: run.rationale || "",
      evidenceIds: [...run.evidenceIds],
    };
  });
  // After losing the connection, ask the user to open a new preview before approving anything.
  const [previewInvalidated, setPreviewInvalidated] = useState(false);
  useEffect(() => {
    if (!state.ready) setPreviewInvalidated(true);
  }, [state.ready]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewHint, setReviewHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const proposal = run.proposals.find((item) => item.revision === run.revision);
  const room = state.rooms.find((item) => item.id === run.roomId);
  const member = room?.members.find((item) => item.identity === state.identity);
  const canApprove = member?.role === "reviewer";
  // Unchanged approved work stays locked. Editing creates a new decision and keeps the old one.
  const proposalApproved =
    !!proposal &&
    run.decisions.some((item) => item.proposalRevision === proposal.revision) &&
    draft.policyId === proposal.policyId &&
    draft.rationale.trim() === proposal.rationale &&
    JSON.stringify([...draft.evidenceIds].sort()) ===
      JSON.stringify([...proposal.evidenceIds].sort());
  const address = { roomId: run.roomId, runId: run.id };
  const stale =
    !!preview &&
    (previewInvalidated ||
      !state.ready ||
      preview.revision !== run.revision ||
      preview.decisionVersion !== run.decisionVersion);
  function edit(next: Partial<typeof draft>) {
    const value = { ...draft, ...next };
    setDraft(value);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(value));
    } catch {
      /* Keep the visible draft usable if browser storage is full. */
    }
  }
  async function perform(action: () => Promise<void>, success?: () => void) {
    setBusy(true);
    setError("");
    try {
      // Keep the current draft and show an error if the server rejects this change.
      await action();
      success?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      emitSignal("error");
    } finally {
      setBusy(false);
    }
  }
  // Send the proposal and decision numbers the user actually previewed, even if newer data has arrived.
  // The server also checks that those numbers are still current and that this user may approve.
  function confirm() {
    if (!preview || stale || busy || !canApprove || proposalApproved) return;
    const captured = preview;
    void perform(
      () =>
        state.scenarioActions.approveDraft({
          ...address,
          expectedRevision: captured.revision,
          expectedDecisionVersion: captured.decisionVersion,
          policyId: captured.policyId,
          rationale: captured.rationale,
          evidenceIds: captured.evidenceIds,
          requestId: crypto.randomUUID(),
        }),
      () => {
        setPreview(null);
        setEditorOpen(false);
        emitSignal("approved");
      },
    );
  }
  return (
    <div className="scenario-workspace">
      <button className="back-link" onClick={onBack}>
        All comparisons
      </button>
      <header className="page-heading">
        <div>
          <Reveal effect="rise">
            <span className="eyebrow">{run.manifest.title}</span>
          </Reveal>
          <Reveal effect="unseal" as="h1">
            {room?.name || run.manifest.title}
          </Reveal>
          <Reveal effect="rise" delay={120} as="p">
            {run.manifest.description}
          </Reveal>
        </div>
        {run.state !== "completed" && (
          <Badge tone={run.state === "error" ? "red" : "neutral"}>
            {run.state === "error" ? "Execution problem" : run.state}
          </Badge>
        )}
      </header>
      <p className="muted small">
        Synthetic comparison · Decision owner {run.manifest.decision_owner} ·
        Dataset {run.manifest.dataset.version} · {run.manifest.dataset.count}{" "}
        synthetic cases
      </p>
      <ComparisonNextStep run={run} state={state} />
      <ErrorNotice message={error || run.diagnostic || ""} />
      {(run.state === "queued" ||
        run.state === "running" ||
        run.state === "cancelling") && (
        <div className="notice">
          {run.state === "cancelling"
            ? "Cancellation requested."
            : "Executing reviewed sources. No measured result is available yet."}
          <button
            disabled={!state.ready || busy || run.state === "cancelling"}
            onClick={() =>
              void perform(() =>
                state.scenarioActions.cancel({
                  ...address,
                  requestId: crypto.randomUUID(),
                }),
              )
            }
          >
            Cancel run
          </button>
        </div>
      )}
      <OutcomeGuide run={run} />
      <section className="scenario-source-grid" aria-label="Frozen source pair">
        {[run.manifest.baseline, run.manifest.candidate].map((id, index) => {
          const source = run.manifest.variants.find((item) => item.id === id);
          return (
            source && (
              <details className="scenario-card" key={id}>
                <summary>
                  <span className={index ? "candidate-text" : "baseline-text"}>
                    {index ? "Candidate" : "Baseline"}
                  </span>{" "}
                  · {source.id}
                </summary>
                <p>{source.file}</p>
                <code className="scenario-hash">SHA-256 {source.sha256}</code>
                <pre>{source.source}</pre>
              </details>
            )
          );
        })}
      </section>
      {run.comparison && (
        <MeasuredCases comparison={run.comparison} manifest={run.manifest} />
      )}
      {run.comparison && (
        <IndependentRequirements requirements={run.comparison.requirements} />
      )}
      <ScenarioInvestigation run={run} />
      <CaseChat key={run.id} run={run} state={state} />
      <section
        className="reviewer-actions scenario-card"
        id="policy-review"
        aria-label="Reviewer actions"
      >
        <button
          className="button-approve"
          disabled={
            !state.ready ||
            busy ||
            !canApprove ||
            proposalApproved ||
            !run.comparison ||
            run.state !== "completed"
          }
          onClick={() => {
            if (
              !run.manifest.policies.some(
                (item) => item.id === draft.policyId,
              ) ||
              !draft.rationale.trim() ||
              !draft.evidenceIds.length
            ) {
              setEditorOpen(true);
              setReviewHint(
                "Choose intended behavior, evidence and a reason for this version.",
              );
              return;
            }
            setPreviewInvalidated(false);
            setPreview({
              revision: run.revision,
              decisionVersion: run.decisionVersion,
              policyId: draft.policyId,
              rationale: draft.rationale.trim(),
              evidenceIds: [...draft.evidenceIds],
            });
          }}
        >
          {proposalApproved ? "APPROVED" : "APPROVE"}
        </button>
        <button
          onClick={() => {
            setEditorOpen(!editorOpen);
            setReviewHint("");
          }}
          aria-expanded={editorOpen}
          aria-controls="review-editor"
        >
          EDIT
        </button>
        <label htmlFor="review-version">Version to approve</label>
        <select
          id="review-version"
          aria-label="Choose version to approve"
          value={run.id}
          onChange={(event) => onSelectVersion(event.target.value)}
        >
          {state.scenarioRuns
            .filter(
              (item) =>
                item.scenarioId === run.scenarioId &&
                item.manifest.baseline === run.manifest.baseline,
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.manifest.candidate} ·{" "}
                {item.comparison
                  ? `${item.comparison.mismatch_count}/${item.comparison.cases.length} differences`
                  : item.state}
                {item.id === run.id ? " · selected" : ""}
              </option>
            ))}
        </select>
        <button
          className="button-defer"
          disabled={
            !state.ready ||
            busy ||
            !run.comparison ||
            run.reviewState === "decided"
          }
          onClick={() =>
            void perform(() =>
              (run.reviewState === "deferred"
                ? state.scenarioActions.resume
                : state.scenarioActions.defer)({
                ...address,
                requestId: crypto.randomUUID(),
              }),
            )
          }
        >
          {run.reviewState === "deferred" ? "RETURN TO REVIEW" : "DEFER"}
        </button>
        {reviewHint && (
          <p className="small" role="status">
            {reviewHint}
          </p>
        )}
      </section>
      {editorOpen && (
        <div className="scenario-review-grid" id="review-editor">
          <section className="scenario-card">
            <h2>Edit intended behavior</h2>
            <p className="muted">
              Choose the intended behavior, evidence and reason for this
              version. Confirm APPROVE to save the decision.
            </p>
            {run.manifest.evidence.map((item) => (
              <div className="scenario-evidence" key={item.id}>
                <label className="scenario-check">
                  <input
                    type="checkbox"
                    checked={draft.evidenceIds.includes(item.id)}
                    onChange={(event) =>
                      edit({
                        evidenceIds: event.target.checked
                          ? [...draft.evidenceIds, item.id]
                          : draft.evidenceIds.filter((id) => id !== item.id),
                      })
                    }
                  />
                  Use {item.title} as evidence
                </label>
                <details>
                  <summary>
                    {item.file} · lines {item.line_start}–{item.line_end}
                  </summary>
                  <code className="scenario-hash">SHA-256 {item.sha256}</code>
                  <pre>
                    {item.source
                      .split("\n")
                      .slice(item.line_start - 1, item.line_end)
                      .join("\n")}
                  </pre>
                </details>
              </div>
            ))}
            <label htmlFor="scenario-policy">Proposed behavior</label>
            <select
              id="scenario-policy"
              value={draft.policyId}
              onChange={(event) => edit({ policyId: event.target.value })}
            >
              <option value="" disabled>
                Choose intended behavior
              </option>
              {run.manifest.policies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.label}
                </option>
              ))}
            </select>
            <p className="small">
              {
                run.manifest.policies.find((item) => item.id === draft.policyId)
                  ?.description
              }
            </p>
            <label htmlFor="scenario-rationale">Decision rationale</label>
            <textarea
              id="scenario-rationale"
              value={draft.rationale}
              maxLength={2000}
              rows={5}
              onChange={(event) => edit({ rationale: event.target.value })}
              placeholder="Explain why this is the intended behavior and how the evidence supports it."
            />
          </section>
        </div>
      )}
      <section
        className="scenario-card team-chat"
        aria-label="Ticket team chat"
      >
        <h2>Team chat</h2>
        <div className="team-chat-members">
          {room?.members.map((person) => (
            <span key={person.identity}>
              {person.label}
              {person.identity === state.identity ? " (you)" : ""}
            </span>
          ))}
          <small>{state.ready ? "Connected" : "Reconnecting"}</small>
        </div>{" "}
        {run.comments.map((item) => (
          <article
            className={`team-chat-message ${item.author === state.identity ? "is-mine" : ""}`}
            key={item.id}
          >
            <small title={item.author}>
              {room?.members.find((person) => person.identity === item.author)
                ?.label || item.author.slice(0, 10)}{" "}
              · {displayTime(item.createdAt)}
            </small>
            <p>{item.text}</p>
          </article>
        ))}
        <textarea
          id="scenario-comment"
          aria-label="Message your team"
          placeholder="Message your team…"
          value={comment}
          maxLength={2000}
          rows={2}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
        <button
          disabled={!state.ready || busy || !comment.trim()}
          onClick={() =>
            void perform(
              () =>
                state.scenarioActions.comment({
                  ...address,
                  text: comment.trim(),
                  requestId: crypto.randomUUID(),
                }),
              () => setComment(""),
            )
          }
        >
          Send
        </button>
      </section>
      <section className="scenario-card">
        <h2>Decision & acceptance history</h2>
        {!run.decisions.length && (
          <p>
            No policy has been approved. Acceptance validation starts only after
            an explicit approval.
          </p>
        )}
        {run.decisions.map((decision) => {
          const validation = decision.validation;
          const unmet =
            validation?.cases.filter((item) => item.state === "fail").length ??
            0;
          const problems =
            validation?.cases.filter((item) => item.state === "error").length ??
            0;
          const outcome = !validation
            ? "Acceptance results pending"
            : unmet > 0
              ? `${unmet} approved expectations unmet`
              : problems > 0
                ? "Some approved checks could not run"
                : `All ${validation.cases.length} approved checks met`;
          return (
            <article className="scenario-decision" key={decision.version}>
              <h3>
                Approved decision {decision.version} · proposal r
                {decision.proposalRevision}{" "}
                <Badge
                  tone={
                    decision.validation?.state === "pass"
                      ? "teal"
                      : decision.validation
                        ? "red"
                        : "amber"
                  }
                >
                  {outcome}
                </Badge>
              </h3>
              {validation && (
                <p className="small">
                  {problems} execution problems ·{" "}
                  {
                    validation.cases.filter((item) => item.state === "pass")
                      .length
                  }{" "}
                  / {validation.cases.length} approved checks met. The policy is
                  approved; these results describe whether the candidate meets
                  it.
                </p>
              )}
              <p>{decision.rationale}</p>
              {decision.validation && (
                <details>
                  <summary>
                    Expected vs observed · {decision.validation.cases.length}{" "}
                    acceptance cases
                  </summary>
                  {decision.validation.cases.map((item) => (
                    <div key={item.id}>
                      <h4>
                        {item.id} ·{" "}
                        {item.state === "fail"
                          ? "Approved expectation unmet"
                          : item.state === "error"
                            ? "Execution problem"
                            : "Approved expectation met"}
                      </h4>
                      <div className="scenario-output-grid">
                        <div>
                          <small>Approved expectation</small>
                          <pre>{json(item.expected)}</pre>
                        </div>
                        <div>
                          <small>Observed candidate</small>
                          <pre>
                            {item.actual
                              ? json(item.actual)
                              : "Execution error: no output"}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                  <code className="scenario-hash">
                    Candidate SHA-256 {decision.validation.candidateHash}
                  </code>
                </details>
              )}
              <button
                disabled={!state.ready || busy || !decision.validation}
                onClick={() =>
                  void perform(() =>
                    state.scenarioActions.export({
                      ...address,
                      decisionVersion: decision.version,
                    }),
                  )
                }
              >
                Export decision {decision.version}
              </button>
            </article>
          );
        })}
      </section>
      {room?.owner === state.identity && (
        <section className="scenario-card">
          <h2>Room access</h2>
          <p className="muted">
            Share this page's address. Each new identity must request access
            before it can read this room.
          </p>
          {state.requests
            .filter(
              (request) =>
                request.roomId === run.roomId && request.state === "pending",
            )
            .map((request) => (
              <div className="scenario-requirement" key={request.id}>
                <div>
                  <strong>{request.label}</strong>
                  <small>{request.identity}</small>
                </div>
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
                  Admit engineer
                </button>
                <button
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
                  Admit reviewer
                </button>
              </div>
            ))}
          <p className="small">
            {room.members.length} admitted members ·{" "}
            {state.presence.filter((item) => item.roomId === run.roomId).length}{" "}
            connected
          </p>
        </section>
      )}
      <details className="scenario-card">
        <summary>Run activity</summary>
        {run.activity.map((item) => (
          <p key={item.id}>
            <Badge>{item.state}</Badge> {item.label}{" "}
            <small>{displayTime(item.createdAt)}</small>
          </p>
        ))}
      </details>
      {preview && (
        <Dialog
          title={`Approve ${run.manifest.candidate}`}
          onClose={() => setPreview(null)}
          wide
        >
          <div className="scenario-setup">
            <p>
              <strong>Selected version: {run.manifest.candidate}</strong>
              <br />
              Compared against {run.manifest.baseline} ·{" "}
              {run.comparison?.cases.length || 0} measured inputs
            </p>
            <p className="small">
              Current proposal revision {preview.revision} · decision version{" "}
              {preview.decisionVersion}
            </p>
            <h3>
              {
                run.manifest.policies.find(
                  (item) => item.id === preview.policyId,
                )?.label
              }
            </h3>
            <p>{preview.rationale}</p>
            <p>Pinned evidence: {preview.evidenceIds.join(", ")}</p>
            <details>
              <summary>
                Inspect exact expectations ·{" "}
                {run.manifest.policies.find(
                  (item) => item.id === preview.policyId,
                )?.cases.length || 0}{" "}
                inputs
              </summary>
              {run.manifest.policies
                .find((item) => item.id === preview.policyId)
                ?.cases.map((item) => (
                  <div key={item.id}>
                    <h4>{item.id}</h4>
                    <div className="scenario-output-grid">
                      <div>
                        <small>Input</small>
                        <pre>{json(item.input)}</pre>
                      </div>
                      <div>
                        <small>Expected</small>
                        <pre>{json(item.expected)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
            </details>
            {stale && (
              <p className="notice notice--error">
                This preview is stale. Close it and preview the current
                revision. Your rationale is preserved.
              </p>
            )}
            <ErrorNotice message={error} />
            <p className="small">
              APPROVE saves this exact policy decision and runs its acceptance
              tests. It does not declare the candidate ready to ship.
            </p>
            <button
              className="button-approve"
              disabled={
                stale || busy || !state.ready || !canApprove || proposalApproved
              }
              onClick={confirm}
            >
              {busy ? "Saving…" : "APPROVE"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
