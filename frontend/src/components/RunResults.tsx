/** Show classic results, supporting evidence, and the test results saved with each approved decision. */
import type { LegacyDiffState, Room, Run } from "../view-model";
import {
  displayTime,
  evidenceExcerpt,
  identityLabel,
  variantLabel,
} from "../presentation";
import { Badge, ErrorNotice } from "./Primitives";
import { Output } from "./CaseTable";

type ActionProps = {
  room: Room;
  run: Run;
  state: LegacyDiffState;
  busy: boolean;
  perform: (operation: () => Promise<void>) => Promise<void>;
};

export function MeasuredCases({ run }: { run: Run }) {
  return (
    <section className="all-cases">
      <h2>Measured cases</h2>
      <p className="muted">
        The same validated input was executed against both pinned variants. A
        difference requires review; neither implementation defines the intended
        policy.
      </p>
      {run.comparison?.cases.map((item) => (
        <details className="measured-case" key={item.id}>
          <summary>
            <strong>{item.id}</strong>
            <span>Day {item.input.age_days}</span>
            <Badge
              tone={
                item.state === "mismatch"
                  ? "amber"
                  : item.state === "error"
                    ? "red"
                    : "teal"
              }
            >
              {item.state}
            </Badge>
          </summary>
          <pre className="input-json">
            {JSON.stringify(item.input, null, 2)}
          </pre>
          <div className="result-pair">
            <div className="result-panel result-panel--baseline">
              <h4>Baseline</h4>
              <Output value={item.baseline.output} />
              <p>{item.baseline.diagnostic}</p>
            </div>
            <div className="result-panel result-panel--candidate">
              <h4>Candidate</h4>
              <Output value={item.candidate.output} />
              <p>{item.candidate.diagnostic}</p>
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}

export function EvidenceSection({
  room,
  run,
  state,
  busy,
  perform,
}: ActionProps) {
  const address = { roomId: room.id, runId: run.id };
  return (
    <section className="evidence-section">
      <div className="section-heading">
        <h3>Evidence</h3>
        <span className="small muted">Sources inform; people decide.</span>
      </div>
      {run.evidence.map((item) => (
        <article className="evidence-card" key={item.id}>
          <header>
            <h4>{item.title}</h4>
            <Badge>{item.provenance}</Badge>
          </header>
          <blockquote>{evidenceExcerpt(item)}</blockquote>
          <div className="evidence-footer">
            <small>
              {item.file} · lines {item.lineStart}–{item.lineEnd}
            </small>
            <button
              className="button-small"
              disabled={
                !state.ready ||
                busy ||
                run.pins.some(
                  (pin) =>
                    pin.author === state.identity && pin.evidenceId === item.id,
                )
              }
              onClick={() =>
                void perform(() =>
                  state.actions.pinEvidence({
                    ...address,
                    evidenceId: item.id,
                    requestId: crypto.randomUUID(),
                  }),
                )
              }
            >
              {run.pins.some(
                (pin) =>
                  pin.author === state.identity && pin.evidenceId === item.id,
              )
                ? "Pinned by you"
                : "Pin evidence"}
            </button>
          </div>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer">
              Open pinned source ↗
            </a>
          )}
          <details>
            <summary>Provenance and pins</summary>
            <p className="fingerprint">
              SHA256 <code>{item.sha256}</code>
            </p>
            <p>
              {run.pins
                .filter((pin) => pin.evidenceId === item.id)
                .map((pin) => identityLabel(room, pin.author))
                .join(", ") || "No shared pins yet."}
            </p>
          </details>
        </article>
      ))}
      {!run.evidence.length && (
        <p className="notice notice--error">
          Evidence unavailable. Evidence-dependent approval is blocked.
        </p>
      )}
    </section>
  );
}

export function ValidationHistory({
  room,
  run,
  state,
  busy,
  perform,
  onNew,
}: ActionProps & { onNew: (candidate?: string) => void }) {
  const address = { roomId: room.id, runId: run.id };
  return (
    <>
      {run.decisions.map((decision) => (
        <section className="validation-section" key={decision.version}>
          <div className="section-heading">
            <h3>Acceptance tests · decision {decision.version}</h3>
            <Badge
              tone={
                decision.validation?.state === "fail"
                  ? "red"
                  : decision.validation?.state === "pass"
                    ? "teal"
                    : "neutral"
              }
            >
              {decision.validation?.state || "queued"}
            </Badge>
          </div>
          <p className="muted">
            Test origin: approved returns policy. These cases check the decision
            below, not overall security or production readiness. Revision{" "}
            {decision.proposalRevision} approved by{" "}
            {identityLabel(room, decision.reviewer)} ·{" "}
            {displayTime(decision.createdAt)}
          </p>
          {decision.validation && (
            <>
              <p>
                {variantLabel(decision.validation.candidate)} ·{" "}
                <code>{decision.validation.candidateHash.slice(0, 12)}</code>
              </p>
              <ErrorNotice message={decision.validation.diagnostic || ""} />
              {decision.validation.cases.map((item) => (
                <details key={item.id} className="measured-case">
                  <summary>
                    <strong>{item.id}</strong>
                    <Badge>{item.state}</Badge>
                  </summary>
                  <div className="result-pair">
                    <div>
                      <h4>Approved expectation</h4>
                      <Output value={item.expected} />
                    </div>
                    <div>
                      <h4>Actual candidate output</h4>
                      <Output value={item.actual} />
                    </div>
                  </div>
                </details>
              ))}
            </>
          )}
          <div className="button-row">
            <button
              disabled={
                !state.ready ||
                busy ||
                !decision.validation ||
                ["queued", "running"].includes(decision.validation.state)
              }
              onClick={() =>
                void perform(() =>
                  state.actions.exportBundle({
                    ...address,
                    decisionVersion: decision.version,
                  }),
                )
              }
            >
              Download review bundle
            </button>
            {run.candidate !== "corrected-v2" && (
              <button
                disabled={!state.ready}
                onClick={() => onNew("corrected-v2")}
              >
                Compare supplied corrected version
              </button>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
