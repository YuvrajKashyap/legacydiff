import type { Room } from "../view-model";
import {
  displayTime,
  filterComparisons,
  variantLabel,
  type HomeView,
} from "../presentation";
import { Badge } from "./Primitives";

export function Home({
  rooms,
  view,
  ready,
  onNew,
  onOpen,
}: {
  rooms: Room[];
  view: HomeView;
  ready: boolean;
  onNew: () => void;
  onOpen: (roomId: string, runId: string) => void;
}) {
  const items = filterComparisons(rooms, view);
  const title = {
    comparisons: "Comparisons",
    queue: "Review queue",
    history: "History",
  }[view];
  return (
    <div className="home-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Migration review workspace</span>
          <h1>{title}</h1>
          <p>
            {view === "comparisons"
              ? "From a measured difference to a decision you can test."
              : view === "queue"
                ? "Unresolved behavior, ready for a shared decision."
                : "Approved decisions and the results they produced."}
          </p>
        </div>
        <button className="button-primary" disabled={!ready} onClick={onNew}>
          <span aria-hidden="true">+</span> New comparison
        </button>
      </header>
      {items.length ? (
        <section className="comparison-list" aria-label={title}>
          <div className="comparison-list-heading">
            <span>Comparison / source pair</span>
            <span>Run state</span>
            <span>Unresolved</span>
            <span>Last activity</span>
          </div>
          {items.map(({ room, run }) => (
            <button
              className="comparison-row"
              key={`${room.id}:${run.id}`}
              onClick={() => onOpen(room.id, run.id)}
            >
              <span className="comparison-name">
                <strong>{room.name}</strong>
                <small>
                  <span className="baseline-text">
                    {variantLabel(run.baseline)}
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="candidate-text">
                    {variantLabel(run.candidate)}
                  </span>
                </small>
              </span>
              <span>
                <Badge
                  tone={
                    run.state === "error"
                      ? "red"
                      : run.state === "compared"
                        ? "teal"
                        : "neutral"
                  }
                >
                  {run.state}
                </Badge>
              </span>
              <span>
                {run.comparison
                  ? run.reviewState === "decided"
                    ? "0"
                    : run.comparison.mismatch_count
                  : "—"}
                <small>{run.reviewState.replaceAll("_", " ")}</small>
              </span>
              <span className="muted">
                {displayTime(run.activity.at(-1)?.createdAt || run.createdAt)}
                <span className="row-arrow" aria-hidden="true">
                  ↗
                </span>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <div className="empty-diff" aria-hidden="true">
            <span>−</span>
            <span>+</span>
          </div>
          <h2>
            {ready
              ? view === "comparisons"
                ? "No comparisons yet"
                : view === "queue"
                  ? "No unresolved comparisons"
                  : "No approved decisions yet"
              : "Connecting to your workspace"}
          </h2>
          <p>
            {ready
              ? view === "comparisons"
                ? "Start with two versions of a returns policy. Execute the same inputs, inspect the difference, and decide together."
                : "Your confirmed comparisons and decisions will appear here."
              : "Restoring your identity and waiting for the authorized snapshot."}
          </p>
          {view === "comparisons" && (
            <button
              className="button-primary"
              disabled={!ready}
              onClick={onNew}
            >
              Start with the returns example <span aria-hidden="true">→</span>
            </button>
          )}
        </section>
      )}
      <div className="workflow-note">
        <span>Execute</span>
        <i aria-hidden="true">→</i>
        <span>Investigate</span>
        <i aria-hidden="true">→</i>
        <span>Decide together</span>
        <i aria-hidden="true">→</i>
        <span>Keep an executable test</span>
      </div>
    </div>
  );
}
