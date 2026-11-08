import { useEffect, useState } from "react";
import { useLegacyDiff } from "../../../packages/client/react";
import type { LegacyDiffState } from "./view-model";
import type { HomeView } from "./presentation";
import { Home } from "./components/Home";
import { SetupPanel } from "./components/SetupPanel";
import { Workspace } from "./components/Workspace";
import { Badge, ErrorNotice } from "./components/Primitives";

function readRoute() {
  const query = new URLSearchParams(window.location.search);
  const rawView = query.get("view");
  const view: HomeView =
    rawView === "queue" || rawView === "history" ? rawView : "comparisons";
  return {
    roomId: query.get("room") || "",
    runId: query.get("run") || "",
    view,
  };
}

export default function App() {
  const state: LegacyDiffState = useLegacyDiff();
  const [route, setRoute] = useState(readRoute);
  const [setup, setSetup] = useState<{
    roomId?: string;
    candidate?: string;
    modelId?: string;
  } | null>(null);
  const room = state.rooms.find((item) => item.id === route.roomId);
  const run =
    room?.runs.find((item) => item.id === route.runId) || room?.runs.at(-1);

  function navigate(next: ReturnType<typeof readRoute>) {
    const query = new URLSearchParams();
    if (next.roomId) query.set("room", next.roomId);
    if (next.runId) query.set("run", next.runId);
    if (!next.roomId && next.view !== "comparisons")
      query.set("view", next.view);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${query.size ? `?${query}` : ""}`,
    );
    setRoute(next);
  }

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openSetup(
    options: { roomId?: string; candidate?: string; modelId?: string } = {},
  ) {
    setSetup(options);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="navigation-rail">
        <a
          className="brand"
          href="?"
          onClick={(event) => {
            event.preventDefault();
            navigate({ roomId: "", runId: "", view: "comparisons" });
          }}
          aria-label="LegacyDiff comparisons"
        >
          <span className="brand-symbol" aria-hidden="true">
            L<span>↔</span>
          </span>
          <strong>
            Legacy<span>Diff</span>
          </strong>
        </a>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "comparisons", label: "Comparisons", icon: "⇄" },
              { id: "queue", label: "Review queue", icon: "☷" },
              { id: "history", label: "History", icon: "◷" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={
                !route.roomId && route.view === item.id ? "is-active" : ""
              }
              aria-current={
                !route.roomId && route.view === item.id ? "page" : undefined
              }
              onClick={() => navigate({ roomId: "", runId: "", view: item.id })}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span className="avatar">
            {state.identity ? state.identity.slice(0, 2).toUpperCase() : "…"}
          </span>
          <div>
            <strong>
              {import.meta.env.VITE_INSTANCE_LABEL || "Working"} workspace
            </strong>
            <small title={state.identity}>
              {state.identity
                ? `Identity ${state.identity.slice(0, 8)}`
                : "Restoring identity"}
            </small>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-label">
            {import.meta.env.VITE_INSTANCE_LABEL || "Working"} |{" "}
            {import.meta.env.VITE_INSTANCE_REVISION || "live changes"}
          </span>
          <div className="readiness">
            <Badge tone={state.ready ? "teal" : "amber"}>
              {state.ready ? "Spacetime connected" : "Connecting / stale"}
            </Badge>
            <Badge
              tone={
                state.catalog?.models.some((item) => item.ready)
                  ? "teal"
                  : "neutral"
              }
            >
              {state.catalog?.models.some((item) => item.ready)
                ? "AI ready"
                : "AI unavailable"}
            </Badge>
          </div>
        </header>
        {!state.ready && (
          <div className="connection-notice" role="status">
            Waiting for a current authorized snapshot. Publishing and approvals
            are disabled.
          </div>
        )}
        <div id="main-content" className="main-content">
          <ErrorNotice message={state.error} />
          {route.roomId && !room ? (
            <Admission roomId={route.roomId} state={state} />
          ) : room && run ? (
            <Workspace
              key={run.id}
              room={room}
              run={run}
              state={state}
              onBack={() =>
                navigate({ roomId: "", runId: "", view: "comparisons" })
              }
              onNew={(candidate) =>
                openSetup({ roomId: room.id, candidate, modelId: run.modelId })
              }
            />
          ) : (
            <Home
              rooms={state.rooms}
              view={route.view}
              ready={state.ready}
              onNew={() => openSetup()}
              onOpen={(roomId, runId) =>
                navigate({ roomId, runId, view: "comparisons" })
              }
            />
          )}
        </div>
        <footer className="app-footer">
          <span>LegacyDiff</span>
          <span>
            Measured behavior. Shared decisions. Executable expectations.
          </span>
        </footer>
      </div>
      {setup && (
        <SetupPanel
          catalog={state.catalog}
          ready={state.ready}
          actions={state.actions}
          onClose={() => setSetup(null)}
          onStarted={(address) => navigate({ ...address, view: "comparisons" })}
          roomId={setup.roomId}
          initialCandidate={setup.candidate}
          initialModelId={setup.modelId}
        />
      )}
    </div>
  );
}

function Admission({
  roomId,
  state,
}: {
  roomId: string;
  state: LegacyDiffState;
}) {
  const [label, setLabel] = useState(
    () => localStorage.getItem("legacydiff.displayName") || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = state.requests.find(
    (item) => item.roomId === roomId && item.identity === state.identity,
  );
  async function requestEntry() {
    setBusy(true);
    setError("");
    try {
      await state.actions.requestJoin({ roomId, label: label.trim() });
      localStorage.setItem("legacydiff.displayName", label.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admission-page">
      <Badge>Shared review room</Badge>
      <h1>
        {request?.state === "pending"
          ? "Access pending"
          : request?.state === "denied"
            ? "Access denied"
            : "Request room access"}
      </h1>
      <p>
        The room owner must admit this identity before you can read or
        contribute. A room link is not an access credential.
      </p>
      <code className="room-locator">{roomId}</code>
      {!request && (
        <>
          <label>
            Your display name
            <input
              value={label}
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <button
            className="button-primary"
            disabled={!state.ready || busy || !label.trim()}
            onClick={() => void requestEntry()}
          >
            {busy ? "Requesting…" : "Request entry"}
          </button>
        </>
      )}
      <ErrorNotice message={error} />
      {request?.state === "pending" && (
        <p className="notice">
          Your request is visible to the owner. This page will open when access
          is granted.
        </p>
      )}
    </section>
  );
}
