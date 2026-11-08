/** Build the main screen and choose which page to show. The client supplies saved data and handles changes. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLegacyDiff } from "../../packages/client/react";
import type { LegacyDiffState } from "./view-model";
import { type HomeView } from "./presentation";
import { comparisonSummaries } from "./comparison-summaries";
import { ScenarioSetup } from "./components/ScenarioSetup";
import { ScenarioWorkspace } from "./components/ScenarioWorkspace";
import { DemoPage } from "./components/DemoPage";
import { Lab } from "./components/Lab";
import { Home } from "./components/Home";
import { SetupPanel } from "./components/SetupPanel";
import { Workspace } from "./components/Workspace";
import {
  Badge,
  ErrorNotice,
  Icon,
  type IconName,
} from "./components/Primitives";
import { ClickRipples, Cursor } from "./motion/components";
import { useTheme } from "./motion/theme";
import { useSignal } from "./motion";

// A room link tells us what to open. The server still decides whether this user can read it.
function readRoute() {
  const query = new URLSearchParams(window.location.search);
  const rawView = query.get("view");
  const view: HomeView | "lab" | "demo" =
    rawView === "queue" ||
    rawView === "history" ||
    rawView === "lab" ||
    rawView === "demo"
      ? rawView
      : "comparisons";
  return {
    roomId: query.get("room") || "",
    runId: query.get("run") || "",
    view,
  };
}

const navigation: Array<{
  id: HomeView | "lab" | "demo";
  label: string;
  icon: IconName;
}> = [
  { id: "comparisons", label: "All comparisons", icon: "compare" },
  { id: "queue", label: "Review queue", icon: "queue" },
  { id: "history", label: "History", icon: "history" },
  { id: "lab", label: "The Lab", icon: "lab" },
  { id: "demo", label: "Demo", icon: "demo" },
];

export default function App() {
  const state: LegacyDiffState = useLegacyDiff();
  const instanceLabel = import.meta.env.VITE_INSTANCE_LABEL || "Working";
  useEffect(() => {
    document.title = `LegacyDiff | ${instanceLabel}`;
  }, [instanceLabel]);
  const [scenarioSetup, setScenarioSetup] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [setup, setSetup] = useState<{
    roomId?: string;
    candidate?: string;
    modelId?: string;
  } | null>(null);
  const room = state.rooms.find((item) => item.id === route.roomId);
  // When a link names a run, show that run only. Someone else may have started a newer one.
  const run = route.runId
    ? room?.runs.find((item) => item.id === route.runId)
    : room?.runs.at(-1);
  const scenarioRun = state.scenarioRuns.find(
    (item) =>
      item.roomId === route.roomId && (!route.runId || item.id === route.runId),
  );
  const navigationCounts = {
    comparisons: comparisonSummaries(
      state.rooms,
      state.scenarioRuns,
      "comparisons",
    ).length,
    queue: comparisonSummaries(state.rooms, state.scenarioRuns, "queue").length,
    history: comparisonSummaries(state.rooms, state.scenarioRuns, "history")
      .length,
  };

  // Changing pages affects this browser only; other people can keep reading a different page.
  function navigate(next: ReturnType<typeof readRoute>) {
    const query = new URLSearchParams();
    if (next.roomId) query.set("room", next.roomId);
    if (next.runId) query.set("run", next.runId);
    if (next.view === "lab" || (!next.roomId && next.view !== "comparisons"))
      query.set("view", next.view);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${query.size ? `?${query}` : ""}`,
    );
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
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

  const activeNav =
    route.view === "lab" || route.view === "demo"
      ? route.view
      : route.roomId
        ? null
        : route.view;
  const activeIndex = navigation.findIndex((item) => item.id === activeNav);
  // A key on the page wrapper replays the page entrance when the route changes.
  const pageKey = `${route.view}:${route.roomId}:${route.runId}`;
  const aiReady = !!state.catalog?.models.some((item) => item.ready);

  return (
    <div className="app-shell">
      <Cursor />
      <ClickRipples />
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
          <BrandMark />
          <strong>
            Legacy<span>Diff</span>
          </strong>
        </a>
        <nav
          aria-label="Main navigation"
          style={{ "--active-index": activeIndex } as CSSProperties}
          data-has-active={activeIndex >= 0}
        >
          <span className="nav-indicator" aria-hidden="true" />
          {navigation.map((item) => (
            <button
              key={item.id}
              className={activeNav === item.id ? "is-active" : ""}
              aria-current={activeNav === item.id ? "page" : undefined}
              onClick={() => navigate({ roomId: "", runId: "", view: item.id })}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.id !== "lab" && item.id !== "demo" && (
                <small className="nav-count">{navigationCounts[item.id]}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-flow" aria-hidden="true">
          <span>Execute</span>
          <span>Investigate</span>
          <span>Decide</span>
          <span>Test</span>
        </div>
        <div className="rail-footer">
          <span className="avatar">YK</span>
          <div>
            <strong>
              <a href="/main/">Main workspace</a>
            </strong>
            <small title={state.identity}>
              <a href="/">Identity yxk220038</a>
            </small>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-label">
            <span className="readout">{instanceLabel}</span>
            <span className="topbar-sep" aria-hidden="true" />
            <span>
              {import.meta.env.VITE_INSTANCE_REVISION || "live changes"}
            </span>
          </span>
          <div className="readiness">
            <Badge>{instanceLabel}</Badge>
            <span
              className={`status-chip ${state.ready ? "status-chip--on" : "status-chip--warn"}`}
            >
              <span
                className={`live-dot ${state.ready ? "live-dot--on" : "live-dot--warn"}`}
                aria-hidden="true"
              />
              {state.ready ? "Spacetime connected" : "Connecting / stale"}
            </span>
            <span className={`status-chip ${aiReady ? "status-chip--on" : ""}`}>
              <span
                className={`live-dot ${aiReady ? "live-dot--on" : ""}`}
                aria-hidden="true"
              />
              {aiReady ? "AI ready" : "AI unavailable"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        {!state.ready && (
          <div className="connection-notice" role="status">
            <span className="connection-scan" aria-hidden="true" />
            Waiting for a current authorized snapshot. Publishing and approvals
            are disabled.
          </div>
        )}
        <div id="main-content" className="main-content">
          <ErrorNotice message={state.error} />
          <div className="page-enter" key={pageKey}>
            {route.view === "demo" ? (
              <DemoPage
                state={state}
                onOpenComparison={(runId) => {
                  const selected = state.scenarioRuns.find(
                    (item) => item.id === runId,
                  );
                  if (selected)
                    navigate({
                      roomId: selected.roomId,
                      runId: selected.id,
                      view: "comparisons",
                    });
                }}
                onOpenLab={() =>
                  navigate({ roomId: "", runId: "", view: "lab" })
                }
                onBack={() =>
                  navigate({ roomId: "", runId: "", view: "comparisons" })
                }
              />
            ) : route.view === "lab" ? (
              <Lab
                state={state}
                selectedRunId={route.runId}
                onSelect={(roomId, runId) =>
                  navigate({ roomId, runId, view: "lab" })
                }
                onOpen={(roomId, runId) =>
                  navigate({ roomId, runId, view: "comparisons" })
                }
              />
            ) : scenarioRun ? (
              <ScenarioWorkspace
                key={scenarioRun.id}
                run={scenarioRun}
                state={state}
                onSelectVersion={(id) => {
                  const selected = state.scenarioRuns.find(
                    (item) => item.id === id,
                  );
                  if (selected)
                    navigate({
                      roomId: selected.roomId,
                      runId: selected.id,
                      view: "comparisons",
                    });
                }}
                onBack={() =>
                  navigate({ roomId: "", runId: "", view: "comparisons" })
                }
              />
            ) : route.roomId && !room ? (
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
                  openSetup({
                    roomId: room.id,
                    candidate,
                    modelId: run.modelId,
                  })
                }
              />
            ) : route.roomId && route.runId ? (
              <section className="empty-state panel">
                <h1>
                  {state.ready
                    ? "Comparison unavailable"
                    : "Restoring comparison"}
                </h1>
                <p>
                  {state.ready
                    ? "This run is not in the current authorized snapshot. No different run has been substituted."
                    : "Waiting for the requested run's authorized snapshot."}
                </p>
                <button
                  onClick={() =>
                    navigate({ roomId: "", runId: "", view: "comparisons" })
                  }
                >
                  All comparisons
                </button>
              </section>
            ) : (
              <Home
                rooms={state.rooms}
                scenarioRuns={state.scenarioRuns}
                view={route.view}
                ready={state.ready}
                onNew={() => setScenarioSetup(true)}
                onOpen={(roomId, runId) =>
                  navigate({ roomId, runId, view: "comparisons" })
                }
              />
            )}
          </div>
        </div>
        <footer className="app-footer">
          <span>LegacyDiff</span>
          <span>
            Measured behavior. Shared decisions. Executable expectations.
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Main navigation (mobile)">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={activeNav === item.id ? "is-active" : ""}
            aria-current={activeNav === item.id ? "page" : undefined}
            aria-label={item.label}
            onClick={() => navigate({ roomId: "", runId: "", view: item.id })}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label.split(" ").at(-1)}</span>
          </button>
        ))}
      </nav>
      <SignalFlash />
      {scenarioSetup && (
        <ScenarioSetup
          state={state}
          onClose={() => setScenarioSetup(false)}
          onStarted={(address) => navigate({ ...address, view: "comparisons" })}
          onClassic={() => {
            setScenarioSetup(false);
            openSetup();
          }}
        />
      )}
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

/** The brand mark: two bars that nearly meet, with the gap lit. It is the product in one glyph. */
function BrandMark() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="30" height="30">
        <rect x="5" y="7" width="9" height="18" rx="2" className="brand-left" />
        <rect
          x="18"
          y="7"
          width="9"
          height="18"
          rx="2"
          className="brand-right"
        />
        <rect
          x="14.6"
          y="12"
          width="2.8"
          height="8"
          rx="1"
          className="brand-gap"
        />
      </svg>
    </span>
  );
}

/** Switch between the dark and light look. The wipe starts from the button itself. */
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      className="theme-toggle"
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggle({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          <Icon name={theme === "dark" ? "moon" : "sun"} size={12} />
        </span>
      </span>
    </button>
  );
}

/**
 * A page-wide flash that answers signals from anywhere: a soft ring blooms from the
 * screen edge when something was published, approved or copied. It changes nothing.
 */
function SignalFlash() {
  const ref = useRef<HTMLDivElement>(null);
  useSignal((signal) => {
    const element = ref.current;
    if (!element) return;
    element.dataset.signal = signal;
    element.classList.remove("is-flashing");
    void element.offsetWidth;
    element.classList.add("is-flashing");
  });
  return <div ref={ref} className="signal-flash" aria-hidden="true" />;
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
    <section className="admission-page panel">
      <div className="admission-orbit" aria-hidden="true">
        <span
          className={`live-dot ${request?.state === "pending" ? "live-dot--busy" : ""}`}
        />
      </div>
      <Badge tone="plum">Shared review room</Badge>
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
