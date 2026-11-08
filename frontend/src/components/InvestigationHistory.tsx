import { AiText } from "./AiText";
/** Keep earlier AI attempts available so a later success never erases a failure. */
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import { displayTime } from "../presentation";
import { Badge } from "./Primitives";

export function InvestigationHistory({ run }: { run: ScenarioRun }) {
  const attempts = run.investigationAttempts || [];
  const previous = attempts.slice(0, -1);
  if (!previous.length) return null;
  return (
    <details className="investigation-history">
      <summary>Earlier investigations · {previous.length}</summary>
      <p className="small muted">
        Each attempt keeps its own model, result and activity. These records are
        earlier work, not the current attempt.
      </p>
      {previous.map((attempt, index) => {
        const result = savedResult(attempt.outcome);
        return (
          <details className="scenario-finding" key={attempt.id}>
            <summary>
              <strong>Attempt {index + 1}</strong>{" "}
              <Badge tone={attempt.state === "failed" ? "red" : "neutral"}>
                {attempt.state}
              </Badge>
              {run.latestSuccessfulInvestigationId === attempt.id && (
                <Badge>Latest successful attempt</Badge>
              )}
            </summary>
            <div className="scenario-finding-body">
              <p className="small muted">
                Model {attempt.modelId} ·{" "}
                {attempt.createdAt
                  ? displayTime(attempt.createdAt)
                  : "Start time not recorded"}
                {attempt.completedAt &&
                  ` · Finished ${displayTime(attempt.completedAt)}`}
              </p>
              {attempt.diagnostic && (
                <p className="notice notice--error">{attempt.diagnostic}</p>
              )}
              <p>
                {result.summary ||
                  "No final summary recorded for this attempt."}
              </p>
              {result.roles.map((role, roleIndex) => (
                <details key={roleIndex}>
                  <summary>
                    {role.name} · {role.state}
                  </summary>
                  <AiText text={role.summary || "No role summary recorded."} />
                </details>
              ))}
              <details>
                <summary>
                  Saved activity · {attempt.trace.length} events
                </summary>
                {attempt.trace.map((event) => (
                  <p className="small" key={event.id}>
                    <strong>{event.label}</strong> · {event.state}
                    <br />
                    {event.detail || "No further detail recorded."}
                  </p>
                ))}
              </details>
            </div>
          </details>
        );
      })}
    </details>
  );
}

function savedResult(raw?: string): {
  summary: string;
  roles: { name: string; state: string; summary: string }[];
} {
  try {
    const result = JSON.parse(raw || "null") as unknown;
    if (!result || typeof result !== "object" || Array.isArray(result))
      return { summary: "", roles: [] };
    const value = result as Record<string, unknown>;
    const roles = Array.isArray(value.roles)
      ? value.roles
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === "object" && !Array.isArray(item),
          )
          .map((item) => ({
            name: typeof item.role === "string" ? item.role : "Role",
            state: typeof item.state === "string" ? item.state : "Not recorded",
            summary: typeof item.summary === "string" ? item.summary : "",
          }))
      : [];
    return {
      summary: typeof value.summary === "string" ? value.summary : "",
      roles,
    };
  } catch {
    return { summary: "Saved result could not be read.", roles: [] };
  }
}
