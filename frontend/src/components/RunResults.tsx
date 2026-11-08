/** Show classic results, supporting evidence, and the test results saved with each approved decision. */
import type { CSSProperties } from "react";
import type { LegacyDiffState, Room, Run } from "../view-model";
import {
  displayTime,
  evidenceExcerpt,
  identityLabel,
  variantLabel,
} from "../presentation";
import { Reveal, Section, TiltCard } from "../motion/components";
import { Badge, ErrorNotice, Icon } from "./Primitives";
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
    <Section className="all-cases">
      <h2>Measured cases</h2>
      <p className="muted">
        The same validated input was executed against both pinned variants. A
        difference requires review; neither implementation defines the intended
        policy.
      </p>
      <div className="stagger">
        {run.comparison?.cases.map((item, index) => (
          <Reveal
            effect="unseal"
            key={item.id}
            style={{ "--i": index } as CSSProperties}
          >
            <details className={`measured-case measured-case--${item.state}`}>
              <summary>
                <strong className="mono">{item.id}</strong>
                <span>Day {item.input.age_days}</span>
                <span className="measured-flags">
                  {item.input.has_receipt ? "receipt" : "no receipt"} ·{" "}
                  {item.input.final_sale ? "final sale" : "regular"}
                </span>
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
          </Reveal>
        ))}
      </div>
    </Section>
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
    <Section className="evidence-section">
      <div className="section-heading">
        <h3>Evidence</h3>
        <span className="small muted">Sources inform; people decide.</span>
      </div>
      <div className="evidence-grid stagger">
        {run.evidence.map((item, index) => {
          const pinnedByMe = run.pins.some(
            (pin) =>
              pin.author === state.identity && pin.evidenceId === item.id,
          );
          const pinners = run.pins.filter((pin) => pin.evidenceId === item.id);
          return (
            <Reveal
              effect="deal-in"
              key={item.id}
              style={{ "--i": index } as CSSProperties}
            >
              <TiltCard
                as="article"
                className={`evidence-card ${pinnedByMe ? "is-pinned" : ""}`}
                strength={3}
              >
                <header>
                  <h4>{item.title}</h4>
                  <Badge
                    tone={item.provenance === "Live" ? "green" : "neutral"}
                  >
                    {item.provenance}
                  </Badge>
                </header>
                <blockquote>{evidenceExcerpt(item)}</blockquote>
                <div className="evidence-footer">
                  <small>
                    {item.file} · lines {item.lineStart}–{item.lineEnd}
                  </small>
                  <button
                    className="button-small"
                    disabled={!state.ready || busy || pinnedByMe}
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
                    {pinnedByMe ? "Pinned by you" : "Pin evidence"}
                  </button>
                </div>
                {pinners.length > 0 && (
                  <div className="evidence-pinners" aria-label="Pinned by">
                    {pinners.map((pin) => (
                      <span
                        key={pin.author}
                        title={identityLabel(room, pin.author)}
                      >
                        {identityLabel(room, pin.author)
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open pinned source <Icon name="arrow" size={12} />
                  </a>
                )}
                <details>
                  <summary>Provenance and pins</summary>
                  <p className="fingerprint">
                    SHA256 <code>{item.sha256}</code>
                  </p>
                  <p>
                    {pinners
                      .map((pin) => identityLabel(room, pin.author))
                      .join(", ") || "No shared pins yet."}
                  </p>
                </details>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
      {!run.evidence.length && (
        <p className="notice notice--error">
          Evidence unavailable. Evidence-dependent approval is blocked.
        </p>
      )}
    </Section>
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
      {run.decisions.map((decision) => {
        const validationState = decision.validation?.state;
        const passed =
          decision.validation?.cases.filter((item) => item.state === "pass")
            .length ?? 0;
        const total = decision.validation?.cases.length ?? 0;
        return (
          <Section
            className={`validation-section validation-section--${validationState ?? "queued"}`}
            key={decision.version}
          >
            <div className="section-heading">
              <h3>Acceptance tests · decision {decision.version}</h3>
              <Badge
                tone={
                  validationState === "fail"
                    ? "red"
                    : validationState === "pass"
                      ? "green"
                      : "neutral"
                }
              >
                {(!validationState ||
                  ["queued", "running"].includes(validationState)) && (
                  <span
                    className="live-dot live-dot--busy"
                    aria-hidden="true"
                  />
                )}
                {validationState || "queued"}
              </Badge>
            </div>
            {decision.validation && total > 0 && (
              <Reveal
                effect="rise"
                className="validation-meter"
                aria-hidden="true"
              >
                {decision.validation.cases.map((item) => (
                  <i
                    key={item.id}
                    className={`validation-cell validation-cell--${item.state}`}
                    title={`${item.id}: ${item.state}`}
                  />
                ))}
                <span className="mono">
                  {passed}/{total} met
                </span>
              </Reveal>
            )}
            <p className="muted">
              Test origin: approved returns policy. These cases check the
              decision below, not overall security or production readiness.
              Revision {decision.proposalRevision} approved by{" "}
              {identityLabel(room, decision.reviewer)} ·{" "}
              {displayTime(decision.createdAt)}
            </p>
            {decision.validation && (
              <>
                <p className="mono small">
                  {variantLabel(decision.validation.candidate)} ·{" "}
                  <code>{decision.validation.candidateHash.slice(0, 12)}</code>
                </p>
                <ErrorNotice message={decision.validation.diagnostic || ""} />
                {decision.validation.cases.map((item) => (
                  <details
                    key={item.id}
                    className={`measured-case measured-case--${item.state}`}
                  >
                    <summary>
                      <strong className="mono">{item.id}</strong>
                      <Badge
                        tone={
                          item.state === "pass"
                            ? "green"
                            : item.state === "fail"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {item.state}
                      </Badge>
                    </summary>
                    <div className="result-pair">
                      <div className="result-panel">
                        <h4>Approved expectation</h4>
                        <Output value={item.expected} />
                      </div>
                      <div className="result-panel result-panel--candidate">
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
          </Section>
        );
      })}
    </>
  );
}
