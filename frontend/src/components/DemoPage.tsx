/** A read-only product walkthrough; buttons open real work without creating demo records. */
import { useEffect, useState } from "react";
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";
import "../styles/demo.css";

const stages = [
  {
    title: "Choose the migration question",
    feature: "New comparison · source versions · model choice",
    person: "Alex Chen",
    role: "Engineer",
    contribution:
      "Let's compare the permissions rewrite before we ship. Matching outputs alone won't tell us whether tenant access is safe.",
    explanation:
      "Choose returns, pricing, accounts payable, or permissions in New comparison. Pick reviewed source versions and an available model. Deterministic comparison can run without AI; the selected model is used when you request an investigation.",
  },
  {
    title: "Inspect what actually changed",
    feature: "Executed comparisons · case filters · independent checks",
    person: "Sam Rivera",
    role: "Engineer",
    contribution:
      "Show me the same input in both versions. Then check the access rules even where the outputs agree.",
    explanation:
      "The comparison shows actual baseline and candidate outputs, field differences, execution errors, and source hashes. Independent requirements check both versions for shared defects. In permissions, denial rules cannot be waived by a policy choice.",
  },
  {
    title: "Investigate with specialist agents",
    feature: "NVIDIA Nemotron · orchestration · evidence",
    person: "Alex Chen",
    role: "Engineer",
    contribution:
      "Have the behavior specialist trace the difference, the policy specialist inspect our evidence, and the regression specialist suggest cases.",
    explanation:
      "An orchestrator coordinates three separate specialist conversations and combines their findings. Measured cases and reviewed evidence ground the investigation; activity and saved traces show what actually completed. AI recommendations do not approve a policy or turn a failed check into a pass.",
  },
  {
    title: "Ask about the specific case",
    feature: "Case chat · follow-up context",
    person: "Sam Rivera",
    role: "Engineer",
    contribution:
      "Why does this cross-tenant case still return protected fields, and which evidence supports denying it?",
    explanation:
      "Case chat keeps the question attached to this comparison and selected case. Follow-ups use saved context and the chosen model. Read the response against the underlying outputs and cited evidence; a chat answer is advice, not a saved decision.",
  },
  {
    title: "Review together without losing changes",
    feature: "SpacetimeDB · membership · presence · conflicts",
    person: "Riley Morgan",
    role: "Reviewer",
    contribution:
      "I can review the proposal after the owner admits me. If the proposal changes while I am reading, I'll reopen the approval preview.",
    explanation:
      "Room membership and roles control access; presence reports who is in the room. Comments are shared while drafts stay private. Revision checks reject stale approvals and competing writes. This local workspace has no remote sharing deployment enabled.",
  },
  {
    title: "Make the policy decision explicit",
    feature: "Evidence · proposals · approval preview · defer",
    person: "Riley Morgan",
    role: "Reviewer",
    contribution:
      "Keep deny-overrides and tenant isolation. Show me the exact expected results and proposal revision before I approve.",
    explanation:
      "Publish a policy proposal with rationale and evidence, then preview its exact expected outputs. A reviewer approves that revision or defers the decision. Approval queues validation; it does not certify that the candidate already satisfies the policy.",
  },
  {
    title: "Validate, export, and keep the record",
    feature: "Acceptance checks · independent requirements · export · history",
    person: "Alex Chen",
    role: "Engineer",
    contribution:
      "If validation fails, we'll keep that result visible and revise the code. Once reviewed, export the source, evidence, expectations, and checks so another engineer can reproduce it.",
    explanation:
      "Validation runs the candidate against approved expectations. Export preserves the decision, source and dataset hashes, measured results, and standalone checks. A later proposal does not rewrite an older decision or its validation. The walkthrough itself creates no approval, export, or history record.",
  },
];

export function DemoPage({
  state,
  onOpenComparison,
  onOpenLab,
  onBack,
}: {
  state: LegacyDiffState;
  onOpenComparison: (runId: string) => void;
  onOpenLab: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Playback changes only this tour. It never creates members, comments or approvals.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step === stages.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [playing, step]);
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);
  const stage = stages[step];
  // These counts come only from saved server data, never from the storyline above.
  const measured = state.scenarioRuns.filter((run) => run.comparison);
  const example = measured.find(
    (run) =>
      run.scenarioId === "permissions" &&
      run.comparison?.baseline === "permissions-legacy-v1" &&
      run.comparison?.candidate === "permissions-rewrite-v2",
  );
  const investigations = state.scenarioRuns.filter(
    (run) => run.investigationState === "completed",
  );
  return (
    <div className="demo-page">
      <button className="back-link" onClick={onBack}>
        ← Comparisons
      </button>
      <header className="demo-heading">
        <span className="eyebrow">Demo · guided product walkthrough</span>
        <h1>From a code difference to a reviewed decision</h1>
        <p>
          Follow Alex, Sam, and Riley through one migration review. Their
          conversation illustrates the workflow; saved results below come from
          your actual workspace.
        </p>
        <div className="demo-actions">
          <button onClick={onOpenLab}>Open the Lab</button>
          {example && (
            <button onClick={() => onOpenComparison(example.id)}>
              Open saved {example.manifest.title} comparison
            </button>
          )}
        </div>
      </header>
      <section className="demo-live" aria-label="Actual workspace records">
        <strong>Actual workspace</strong>
        <span>
          {state.ready ? "Connected" : "Disconnected · last received records"}
        </span>
        <span>{measured.length} saved scenario comparisons</span>
        <span>{investigations.length} completed investigations</span>
        <p>
          Open a saved comparison for its measured outputs, trace, decisions,
          and validation.
        </p>
      </section>
      <div className="demo-tour">
        <nav aria-label="Walkthrough steps">
          <ol>
            {stages.map((item, index) => (
              <li key={item.title}>
                <button
                  aria-current={step === index ? "step" : undefined}
                  onClick={() => {
                    setStep(index);
                    setPlaying(false);
                  }}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <article className="demo-stage" aria-live="polite">
          <span className="eyebrow">
            Step {step + 1} of {stages.length} · {stage.feature}
          </span>
          <h2>{stage.title}</h2>
          <DemoScene step={step} playing={playing} run={example} />
          <p>{stage.explanation}</p>
          <div className="demo-playback" aria-label="Demo playback controls">
            <button
              className="button-primary"
              onClick={() => {
                if (step === stages.length - 1 && !playing) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play walkthrough"}
            </button>
            <button
              onClick={() => {
                setStep(0);
                setPlaying(true);
              }}
            >
              Replay
            </button>
            <span>
              {playing
                ? "Playing · 9 seconds per scene"
                : step === stages.length - 1
                  ? "Walkthrough finished"
                  : "Paused · explore at your pace"}
            </span>
          </div>
          <div className="demo-actions">
            <button
              disabled={step === 0}
              onClick={() => {
                setStep(step - 1);
                setPlaying(false);
              }}
            >
              Previous
            </button>
            <button
              onClick={() => {
                setStep(step === stages.length - 1 ? 0 : step + 1);
                setPlaying(false);
              }}
            >
              {step === stages.length - 1 ? "Restart tour" : "Continue"}
            </button>
          </div>
        </article>
      </div>
      <section className="demo-tracks">
        <h2>How the capabilities map to the tracks</h2>
        <p>
          This is a capability guide, not a claim of submission or eligibility.
        </p>
        <div>
          <article>
            <h3>8090 · Modernization</h3>
            <p>
              Compare observed legacy behavior with a human-selected policy,
              preserve evidence, and export reproducible acceptance checks.
            </p>
          </article>
          <article>
            <h3>NVIDIA · Beyond a chatbot</h3>
            <p>
              Nemotron supports orchestrated specialist investigation over
              execution results and evidence. Saved traces distinguish completed
              work from queued, partial, or failed activity.
            </p>
          </article>
          <article>
            <h3>SpacetimeDB · Collaboration</h3>
            <p>
              Shared rooms, membership, presence, comments, and revision-aware
              approvals support team review. Remote deployment and track
              qualification remain unverified.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

/** Preview controls change only this page; saved measurements are explicitly identified. */
const demoPeople = [
  { name: "Alex Chen", initials: "AC", role: "Engineer", color: "teal" },
  { name: "Sam Rivera", initials: "SR", role: "Engineer", color: "plum" },
  { name: "Riley Morgan", initials: "RM", role: "Reviewer", color: "ochre" },
];

/** A staged team scene for the Demo page, separate from real workspace presence. */
function DemoScene({
  step,
  playing,
  run,
}: {
  step: number;
  playing: boolean;
  run?: ScenarioRun;
}) {
  const stage = stages[step];
  const messages = stages.slice(Math.max(0, step - 1), step + 1);
  return (
    <div className={`demo-cinema ${playing ? "is-playing" : ""}`}>
      <header className="demo-cinema-title">
        <div>
          <span className="demo-ticket-dot" />
          <strong>Permissions migration review</strong>
        </div>
        <span>Demo ticket · scene {step + 1}/7</span>
      </header>
      <div className="demo-cast" aria-label="Walkthrough collaborators">
        {demoPeople.map((person) => (
          <div
            key={person.name}
            className={`demo-person demo-person--${person.color} ${person.name === stage.person ? "is-active" : ""}`}
          >
            <span className="demo-person-avatar">{person.initials}</span>
            <span>
              <strong>{person.name}</strong>
              <small>{person.role}</small>
            </span>
            <span className="demo-person-activity">
              {person.name === stage.person
                ? step >= 4 && step <= 5
                  ? "Reviewing"
                  : "Contributing"
                : "Following"}
            </span>
          </div>
        ))}
      </div>
      <div className="demo-scene-content" key={step}>
        <div className="demo-ticket-conversation">
          <span className="eyebrow">Ticket conversation</span>
          {messages.map((message) => {
            const person = demoPeople.find(
              (item) => item.name === message.person,
            )!;
            return (
              <article
                className={`demo-scene-message ${message === stage ? "is-current" : ""}`}
                key={message.title}
              >
                <span
                  className={`demo-message-avatar demo-person--${person.color}`}
                >
                  {person.initials}
                </span>
                <div>
                  <header>
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                  </header>
                  <p>{message.contribution}</p>
                </div>
              </article>
            );
          })}
          {step >= 4 && (
            <div className="demo-review-handoff">
              <span>Alex + Sam</span>
              <span aria-hidden="true">→</span>
              <strong>Riley's review</strong>
              <small>
                {step === 4
                  ? "Evidence and proposal handed to the reviewer"
                  : step === 5
                    ? "Exact expectations checked before approval"
                    : "Decision and acceptance results kept together"}
              </small>
            </div>
          )}
        </div>
        <StagePreview step={step} run={run} />
      </div>
      <div className="demo-film-progress" aria-hidden="true">
        {stages.map((item, index) => (
          <span
            key={item.title}
            className={
              index < step ? "is-past" : index === step ? "is-current" : ""
            }
          >
            <i key={`${step}-${index}`} />
          </span>
        ))}
      </div>
      <p className="demo-cinema-caption">
        A staged team walkthrough. Playback does not change the real ticket,
        membership or decisions.
      </p>
    </div>
  );
}

function StagePreview({ step, run }: { step: number; run?: ScenarioRun }) {
  const comparison = run?.comparison;
  const [approved, setApproved] = useState(false);
  if (step === 0)
    return (
      <section className="demo-preview">
        <header>
          New comparison <span>Permissions review</span>
        </header>
        <div className="demo-pair">
          <div>
            <small>BASELINE</small>
            <code>legacy_v1.py</code>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <small>CANDIDATE</small>
            <code>rewrite_v2.py</code>
          </div>
        </div>
        <dl>
          <dt>Input corpus</dt>
          <dd>
            Authentication, role grants, explicit denial, actions, and tenant
            boundaries
          </dd>
          <dt>Investigation model</dt>
          <dd>NVIDIA Nemotron · choose an available model in New comparison</dd>
        </dl>
      </section>
    );
  if (step === 1)
    return (
      <section className="demo-preview">
        <header>
          Saved execution results <span>Original permissions pair</span>
        </header>
        {comparison ? (
          <>
            <div className="demo-metrics">
              <div>
                <strong>{comparison.cases.length}</strong>
                <small>executed inputs</small>
              </div>
              <div>
                <strong>{comparison.mismatch_count}</strong>
                <small>different outputs</small>
              </div>
              <div>
                <strong>{comparison.error_count}</strong>
                <small>execution errors</small>
              </div>
            </div>
            <p>
              {
                comparison.requirements.filter(
                  (item) =>
                    item.baseline === "fail" && item.candidate === "fail",
                ).length
              }{" "}
              requirement rows fail in both versions. Matching behavior can
              still violate a rule.
            </p>
            <div className="demo-result-row">
              <span>Baseline</span>
              <code>{comparison.baseline}</code>
            </div>
            <div className="demo-result-row">
              <span>Candidate</span>
              <code>{comparison.candidate}</code>
            </div>
          </>
        ) : (
          <p>
            The original permissions comparison has not loaded. No measured
            totals are substituted.
          </p>
        )}
      </section>
    );
  if (step === 2)
    return (
      <section className="demo-preview">
        <header>
          Investigation team <span>Illustrative public findings</span>
        </header>
        <div className="demo-agent-root">
          <strong>Nemotron orchestrator</strong>
          <small>
            Plan the review, combine evidence, identify unresolved questions
          </small>
        </div>
        <div className="demo-agent-grid">
          {[
            ["Behavior", "Trace the grant path and compare outputs."],
            ["Policy", "Check default-deny and tenant separation."],
            ["Regression", "Cover cross-tenant reads and denied fields."],
          ].map(([role, text]) => (
            <div key={role}>
              <strong>{role} specialist</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <p>
          Example synthesis: “A shared access defect needs an independent
          requirement, not a vote for the legacy output.” This is a walkthrough
          sample. Open The Lab for the recorded investigation.
        </p>
        <small>
          Saved investigation status:{" "}
          {run?.investigationState ?? "not recorded"}
        </small>
      </section>
    );
  if (step === 3)
    return (
      <section className="demo-preview">
        <header>
          Case chat <span>Cross-tenant read</span>
        </header>
        <div className="demo-chat-bubble">
          <strong>Sam</strong>
          <p>Both versions allow this read. Why is it still a failure?</p>
        </div>
        <div className="demo-chat-bubble demo-chat-answer">
          <strong>Example assistant response</strong>
          <p>
            Matching outputs establish agreement, not correctness. A user in one
            tenant must not receive another tenant's protected data. Inspect the
            tenant-isolation and denied-data requirements alongside this input.
          </p>
          <small>
            Ground the real answer in the selected case and evidence.
          </small>
        </div>
      </section>
    );
  if (step === 4)
    return (
      <section className="demo-preview">
        <header>
          Team handoff <span>One comparison</span>
        </header>
        <ol className="demo-thread">
          <li>
            <strong>Alex · Engineer</strong>
            <p>
              I've attached the access policy and published the proposal for
              review.
            </p>
          </li>
          <li>
            <strong>Sam · Engineer</strong>
            <p>
              Please retain the cross-tenant case even though the outputs match.
            </p>
          </li>
          <li>
            <strong>Riley · Reviewer</strong>
            <p>
              I was reviewing revision 1. I'll reopen revision 2 before
              approving.
            </p>
          </li>
        </ol>
        <div className="demo-notice">
          Revision changed · reopen the preview before approving
        </div>
        <small>
          Example conversation. Actual room presence appears in the saved
          comparison.
        </small>
      </section>
    );
  if (step === 5)
    return (
      <section className="demo-preview">
        <header>
          Approval preview <span>Example revision 2</span>
        </header>
        <dl>
          <dt>Policy</dt>
          <dd>Deny overrides · tenant isolation required</dd>
          <dt>Expected denied output</dt>
          <dd>
            <code>allowed: false · protected_fields: []</code>
          </dd>
          <dt>Reviewer</dt>
          <dd>Riley Morgan</dd>
          <dt>Effect</dt>
          <dd>Save this revision's expectations, then queue validation</dd>
        </dl>
        <button type="button" onClick={() => setApproved(!approved)}>
          {approved ? "Reset preview" : "Preview approval handoff"}
        </button>
        {approved && (
          <p role="status" className="demo-notice">
            Next: the worker would validate the candidate. No approval was saved
            by this preview.
          </p>
        )}
      </section>
    );
  return (
    <section className="demo-preview">
      <header>
        Review handoff <span>Reproducible decision record</span>
      </header>
      <ol className="demo-thread">
        <li>
          <strong>1. Inspect validation</strong>
          <p>
            Check actual results against the approved expected outputs; retain
            failures.
          </p>
        </li>
        <li>
          <strong>2. Export the reviewed bundle</strong>
          <p>
            Source pair, hashes, input corpus, evidence, decision, acceptance
            checks, and independent requirements.
          </p>
        </li>
        <li>
          <strong>3. Preserve history</strong>
          <p>
            Keep the old decision and its result when a new proposal is
            published.
          </p>
        </li>
      </ol>
      <div className="demo-notice">
        This walkthrough has not run validation or created an export.
      </div>
    </section>
  );
}
