import { AiText } from "./AiText";
/** Show saved AI work and its sources. AI suggestions still need a human decision. */
import { useMemo } from "react";
import type { Run } from "../view-model";
import {
  agentRoles,
  investigationPresentation,
  type Citation,
} from "../investigation";
import { Badge } from "./Primitives";

const roleNames = {
  orchestrator: "Orchestrator",
  behavior: "Behavior specialist",
  policy: "Policy specialist",
  regression: "Regression specialist",
};

export function InvestigationPanel({ run }: { run: Run }) {
  const presentation = useMemo(
    () => investigationPresentation(run.activity),
    [run.activity],
  );
  const { ordinary, events, outcome, incomplete, unreadableEvents } =
    presentation;
  const recentEvents = [...events].reverse();
  const hasInvestigation =
    run.modelId !== "deterministic" && Boolean(run.modelId);
  return (
    <>
      <section className="activity-strip" aria-label="Actual run activity">
        <span className="eyebrow">Run activity</span>
        {ordinary.length ? (
          ordinary.slice(-6).map((item) => (
            <span
              className={`activity-event activity-event--${item.state}`}
              key={item.id}
            >
              <i />
              {item.label}
              <small>{item.state}</small>
            </span>
          ))
        ) : (
          <span className="muted">Waiting for the first confirmed event.</span>
        )}
      </section>
      {hasInvestigation && (
        <section
          className="investigation-panel"
          aria-label="Actual AI investigation"
        >
          <header className="section-heading">
            <h2>AI investigation</h2>
            <Badge tone={outcome?.state === "completed" ? "teal" : "neutral"}>
              {outcome?.state ??
                (incomplete ? "outcome incomplete" : "awaiting final outcome")}
            </Badge>
          </header>
          <p className="muted">
            Model analysis informs review. It does not approve policy, establish
            correctness or replace independent security checks.
          </p>
          <div className="investigation-roles">
            {agentRoles.map((role) => {
              const latest = recentEvents.find((event) => event.role === role);
              const final = outcome?.roles[role];
              const state = final?.state ?? latest?.state;
              const summary =
                final?.reason ?? final?.summary ?? latest?.summary;
              const tool = recentEvents.find(
                (event) => event.role === role && event.tool,
              )?.tool;
              return (
                <article className="investigation-role" key={role}>
                  <header>
                    <h3>{roleNames[role]}</h3>
                    <Badge
                      tone={
                        state === "failed"
                          ? "red"
                          : state === "completed"
                            ? "teal"
                            : "neutral"
                      }
                    >
                      {state ?? "not reported"}
                    </Badge>
                  </header>
                  <p className="small muted">
                    {tool
                      ? `Last tool: ${tool.replaceAll("_", " ")}`
                      : "No tool event reported"}
                    {final?.durationMs !== undefined
                      ? ` · ${(final.durationMs / 1000).toFixed(1)}s`
                      : ""}
                  </p>
                  {summary && (
                    <details>
                      <summary>Public summary</summary>
                      <AiText text={summary} />
                      {final?.citations?.length ? (
                        <Citations values={final.citations} />
                      ) : null}
                    </details>
                  )}
                </article>
              );
            })}
          </div>
          {incomplete && (
            <p className="notice">
              The stored result is incomplete or unreadable. Confirmed events
              remain visible; no final success is inferred.
            </p>
          )}
          {unreadableEvents && (
            <p className="notice">
              An activity record could not be displayed. No status is inferred
              from that record.
            </p>
          )}
          {outcome && (
            <>
              <details className="investigation-detail">
                <summary>Model and execution record</summary>
                <dl className="investigation-metadata">
                  <dt>Requested model</dt>
                  <dd>{outcome.requestedModelId}</dd>
                  <dt>Returned model IDs</dt>
                  <dd>{outcome.actualModelIds.join(", ") || "Not reported"}</dd>
                  <dt>Model calls</dt>
                  <dd>
                    {outcome.calls} + {outcome.correctionCalls} correction calls
                  </dd>
                  <dt>Tool requests</dt>
                  <dd>{outcome.toolRequests}</dd>
                  <dt>Retries</dt>
                  <dd>{outcome.retries ?? "Not reported"}</dd>
                  <dt>Distinct cases</dt>
                  <dd>{outcome.distinctCases}</dd>
                  <dt>Measured duration</dt>
                  <dd>{(outcome.durationMs / 1000).toFixed(1)} seconds</dd>
                </dl>
              </details>
              {outcome.proposals.map((proposal, index) => (
                <details className="investigation-detail" key={index}>
                  <summary>Unapproved AI suggestion {index + 1}</summary>
                  <p className="muted">
                    For human consideration only. Use the collaborative review
                    below to publish and approve an exact proposal revision.
                  </p>
                  <p className="small">
                    Measured finding references:{" "}
                    {proposal.finding_refs.join(", ")}
                  </p>
                  {proposal.options.map((option) => (
                    <div className="investigation-option" key={option.choice}>
                      <h4>
                        {option.choice === "include"
                          ? "Include day 30"
                          : "Exclude day 30"}
                      </h4>
                      <AiText text={option.explanation} />
                    </div>
                  ))}
                  <Citations values={proposal.evidence_refs} />
                </details>
              ))}
            </>
          )}
          {events.length > 0 && (
            <details className="investigation-detail">
              <summary>
                Confirmed tool handoffs and public events ({events.length})
              </summary>
              <ol className="investigation-events">
                {events.map((event, index) => (
                  <li key={index}>
                    <div>
                      <strong>{roleNames[event.role]}</strong>{" "}
                      <Badge>{event.state}</Badge>
                      {event.tool && (
                        <span className="small">
                          {" "}
                          · {event.tool.replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                    <AiText text={event.summary} />
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}
    </>
  );
}

function Citations({ values }: { values: Citation[] }) {
  return (
    <div className="investigation-citations">
      {values.map((citation, index) => (
        <figure key={index}>
          <figcaption>
            {citation.artifact_id} · lines {citation.start_line}–
            {citation.end_line}
          </figcaption>
          <blockquote>{citation.quote}</blockquote>
        </figure>
      ))}
    </div>
  );
}
