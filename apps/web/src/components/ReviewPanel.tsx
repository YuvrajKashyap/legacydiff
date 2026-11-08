import { useEffect, useState } from "react";
import type {
  Actions,
  Catalog,
  Choice,
  Proposal,
  Room,
  Run,
} from "../view-model";
import {
  approvalIsStale,
  displayTime,
  evidenceExcerpt,
  identityLabel,
  latestProposal,
} from "../presentation";
import { Badge, Dialog, ErrorNotice } from "./Primitives";
import { CaseTable } from "./CaseTable";

interface Draft {
  choice: Choice | "";
  rationale: string;
  evidenceIds: string[];
}

export function ReviewPanel({
  room,
  run,
  identity,
  ready,
  catalog,
  actions,
}: {
  room: Room;
  run: Run;
  identity: string;
  ready: boolean;
  catalog: Catalog | null;
  actions: Actions;
}) {
  const draftKey = `legacydiff.draft.${identity}.${run.id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem(draftKey) || "null") || {
          choice: "",
          rationale: "",
          evidenceIds: [],
        }
      );
    } catch {
      return { choice: "", rationale: "", evidenceIds: [] };
    }
  });
  const [comment, setComment] = useState("");
  const [editorOpen, setEditorOpen] = useState(!latestProposal(run));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishPreview, setPublishPreview] = useState<{
    expectedRevision: number;
  } | null>(null);
  const [approval, setApproval] = useState<{
    proposal: Proposal;
    decisionVersion: number;
    invalidated: boolean;
  } | null>(null);
  const proposal = latestProposal(run);
  const decisionVersion = Math.max(
    0,
    ...run.decisions.map((item) => item.version),
  );
  const canReview = room.members.some(
    (member) => member.identity === identity && member.role === "reviewer",
  );
  const address = { roomId: room.id, runId: run.id };
  const stale = Boolean(
    approval &&
    (approval.invalidated ||
      approvalIsStale(
        {
          revision: approval.proposal.revision,
          decisionVersion: approval.decisionVersion,
        },
        proposal?.revision || 0,
        decisionVersion,
        ready,
      )),
  );

  useEffect(() => {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey]);
  useEffect(() => {
    if (!ready)
      setApproval((current) =>
        current ? { ...current, invalidated: true } : null,
      );
  }, [ready]);

  async function perform(operation: () => Promise<void>, after?: () => void) {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function toggleEvidence(id: string) {
    setDraft((current) => ({
      ...current,
      evidenceIds: current.evidenceIds.includes(id)
        ? current.evidenceIds.filter((item) => item !== id)
        : [...current.evidenceIds, id],
    }));
  }

  return (
    <section className="review-section">
      <div className="section-heading">
        <h3>Collaborative review</h3>
        <Badge>
          {proposal ? `Revision ${proposal.revision}` : "No proposal yet"}
        </Badge>
      </div>
      <p className="muted">
        Observed behavior is evidence. A reviewer decides the intended rule.
      </p>
      {proposal && (
        <article className="published-proposal">
          <div className="section-heading">
            <strong>
              {proposal.choice === "include"
                ? "Include day 30"
                : "Exclude day 30"}
            </strong>
            <small>
              r{proposal.revision} · {identityLabel(room, proposal.author)}
            </small>
          </div>
          <p>{proposal.rationale}</p>
          <small>
            {proposal.evidenceIds.length} pinned sources ·{" "}
            {displayTime(proposal.createdAt)}
          </small>
          <div className="button-row">
            <button
              className="button-primary"
              disabled={!ready || busy || !canReview}
              onClick={() =>
                setApproval({
                  proposal: structuredClone(proposal),
                  decisionVersion,
                  invalidated: false,
                })
              }
            >
              Review proposal
            </button>
            {!canReview && (
              <small>Only an admitted reviewer can approve.</small>
            )}
          </div>
        </article>
      )}

      <details
        className="proposal-editor"
        open={editorOpen}
        onToggle={(event) => setEditorOpen(event.currentTarget.open)}
      >
        <summary>
          {proposal ? "Publish a new revision" : "Draft a proposal"}
        </summary>
        <fieldset className="choice-picker">
          <legend>Intended day-30 behavior</legend>
          <label className={draft.choice === "include" ? "is-selected" : ""}>
            <input
              type="radio"
              name={`choice-${run.id}`}
              checked={draft.choice === "include"}
              onChange={() => setDraft({ ...draft, choice: "include" })}
            />
            <span>
              <strong>Include day 30</strong>
              <small>Accept returns through the boundary.</small>
            </span>
          </label>
          <label className={draft.choice === "exclude" ? "is-selected" : ""}>
            <input
              type="radio"
              name={`choice-${run.id}`}
              checked={draft.choice === "exclude"}
              onChange={() => setDraft({ ...draft, choice: "exclude" })}
            />
            <span>
              <strong>Exclude day 30</strong>
              <small>Accept returns before the boundary.</small>
            </span>
          </label>
        </fieldset>
        <label htmlFor={`rationale-${run.id}`}>Rationale</label>
        <textarea
          id={`rationale-${run.id}`}
          value={draft.rationale}
          maxLength={2000}
          rows={3}
          placeholder="Explain which interpretation should govern and why."
          onChange={(event) =>
            setDraft({ ...draft, rationale: event.target.value })
          }
        />
        <fieldset className="evidence-checks">
          <legend>Evidence included in this revision</legend>
          {run.evidence.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={draft.evidenceIds.includes(item.id)}
                onChange={() => toggleEvidence(item.id)}
              />
              {item.title}
            </label>
          ))}
        </fieldset>
        <button
          disabled={
            !ready ||
            busy ||
            !draft.choice ||
            !draft.rationale.trim() ||
            !draft.evidenceIds.length ||
            !catalog
          }
          onClick={() =>
            setPublishPreview({ expectedRevision: proposal?.revision || 0 })
          }
        >
          Preview proposal
        </button>
        <p className="small muted">
          Draft stays private to this browser until published. No policy is
          preselected.
        </p>
      </details>

      <div className="discussion">
        <h4>Discussion</h4>
        {run.comments.length === 0 && (
          <p className="muted small">
            No comments yet. Add a challenge or useful context.
          </p>
        )}
        {run.comments.map((item) => (
          <article className="comment" key={item.id}>
            <header>
              <strong>{identityLabel(room, item.author)}</strong>
              <time>{displayTime(item.createdAt)}</time>
            </header>
            <p>{item.text}</p>
          </article>
        ))}
        <label className="sr-only" htmlFor={`comment-${run.id}`}>
          Add a comment
        </label>
        <textarea
          id={`comment-${run.id}`}
          value={comment}
          maxLength={2000}
          rows={2}
          placeholder="Add a comment or request a change…"
          onChange={(event) => setComment(event.target.value)}
        />
        <div className="button-row">
          <button
            disabled={!ready || busy || !comment.trim()}
            onClick={() =>
              void perform(
                () =>
                  actions.addComment({
                    ...address,
                    text: comment.trim(),
                    requestId: crypto.randomUUID(),
                  }),
                () => setComment(""),
              )
            }
          >
            Add comment
          </button>
          <button
            disabled={!ready || busy || !comment.trim()}
            onClick={() =>
              void perform(
                () =>
                  actions.requestChanges({
                    ...address,
                    text: comment.trim(),
                    requestId: crypto.randomUUID(),
                  }),
                () => setComment(""),
              )
            }
          >
            Request changes
          </button>
          <button
            className="button-quiet"
            disabled={!ready || busy}
            onClick={() =>
              void perform(() =>
                actions.deferFinding({
                  ...address,
                  requestId: crypto.randomUUID(),
                }),
              )
            }
          >
            Defer decision
          </button>
        </div>
      </div>
      <ErrorNotice message={error} />

      {publishPreview && draft.choice && catalog && (
        <Dialog
          title="Preview proposal"
          onClose={() => setPublishPreview(null)}
          wide
        >
          <div className="dialog-body">
            <Badge>New revision {publishPreview.expectedRevision + 1}</Badge>
            <h3>
              {draft.choice === "include" ? "Include day 30" : "Exclude day 30"}
            </h3>
            <p>{draft.rationale}</p>
            <CaseTable cases={catalog.expectedCases[draft.choice]} />
            <h4>Pinned evidence</h4>
            {run.evidence
              .filter((item) => draft.evidenceIds.includes(item.id))
              .map((item) => (
                <blockquote key={item.id}>
                  {evidenceExcerpt(item)}
                  <cite>
                    {item.title} · {item.provenance}
                  </cite>
                </blockquote>
              ))}
            <ErrorNotice message={error} />
          </div>
          <footer className="dialog-actions">
            <button onClick={() => setPublishPreview(null)}>Back</button>
            <button
              className="button-primary"
              disabled={!ready || busy}
              onClick={() =>
                void perform(
                  () =>
                    actions.publishProposal({
                      ...address,
                      expectedRevision: publishPreview.expectedRevision,
                      choice: draft.choice as Choice,
                      rationale: draft.rationale.trim(),
                      evidenceIds: draft.evidenceIds,
                      requestId: crypto.randomUUID(),
                    }),
                  () => setPublishPreview(null),
                )
              }
            >
              Publish proposal
            </button>
          </footer>
        </Dialog>
      )}

      {approval && (
        <Dialog
          title={`Review proposal · revision ${approval.proposal.revision}`}
          onClose={() => setApproval(null)}
          wide
        >
          <div className="dialog-body">
            <div className="section-heading">
              <Badge tone="plum">
                Exact revision {approval.proposal.revision}
              </Badge>
              <span className="small muted">
                Current decision version {approval.decisionVersion}
              </span>
            </div>
            <h3>
              {approval.proposal.choice === "include"
                ? "Include day 30"
                : "Exclude day 30"}
            </h3>
            <p>{approval.proposal.rationale}</p>
            <CaseTable cases={approval.proposal.cases} />
            <h4>Pinned evidence</h4>
            {run.evidence
              .filter((item) => approval.proposal.evidenceIds.includes(item.id))
              .map((item) => (
                <blockquote key={item.id}>
                  {evidenceExcerpt(item)}
                  <cite>
                    {item.title} · {item.sha256.slice(0, 12)}
                  </cite>
                </blockquote>
              ))}
            <p className="notice">
              Approval records this exact revision and queues its acceptance
              tests. A failing candidate is a valid outcome.
            </p>
            {stale && (
              <p className="notice notice--error" role="alert">
                This proposal changed. Review the latest revision. Your local
                rationale is preserved.
              </p>
            )}
            <ErrorNotice message={error} />
          </div>
          <footer className="dialog-actions">
            <button onClick={() => setApproval(null)}>Back</button>
            <button
              className="button-primary"
              disabled={!ready || busy || stale}
              onClick={() =>
                void perform(
                  () =>
                    actions.approveProposal({
                      ...address,
                      expectedRevision: approval.proposal.revision,
                      expectedDecisionVersion: approval.decisionVersion,
                      requestId: crypto.randomUUID(),
                    }),
                  () => setApproval(null),
                )
              }
            >
              Approve this revision and run tests
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
