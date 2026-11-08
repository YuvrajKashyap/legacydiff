/** Let the user choose classic returns sources and a model, then start the comparison. */
import { useState } from "react";
import type { Actions, Catalog, RunAddress } from "../view-model";
import { SourcePanel } from "./SourcePanel";
import { Badge, Dialog, ErrorNotice } from "./Primitives";

export function SetupPanel({
  catalog,
  ready,
  actions,
  onClose,
  onStarted,
  roomId,
  initialCandidate = "rewrite-v2",
  initialModelId,
}: {
  catalog: Catalog | null;
  ready: boolean;
  actions: Actions;
  onClose: () => void;
  onStarted: (address: RunAddress) => void;
  roomId?: string;
  initialCandidate?: string;
  initialModelId?: string;
}) {
  const [name, setName] = useState("Returns policy review");
  const [label, setLabel] = useState(
    () => localStorage.getItem("legacydiff.displayName") || "",
  );
  const [candidate, setCandidate] = useState(initialCandidate);
  const [modelId, setModelId] = useState(
    initialModelId && initialModelId !== "deterministic"
      ? initialModelId
      : catalog?.models[0]?.id || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const model = catalog?.models.find((item) => item.id === modelId);
  const canStart =
    ready &&
    Boolean(catalog) &&
    Boolean(label.trim()) &&
    Boolean(name.trim()) &&
    !busy;

  async function start(withAi: boolean) {
    if (!canStart || (withAi && !model?.ready)) return;
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("legacydiff.displayName", label.trim());
      const address = await actions.startComparison({
        name: name.trim(),
        label: label.trim(),
        candidate,
        modelId,
        withAi,
        requestId,
        roomId,
      });
      onStarted(address);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="What are we comparing?" onClose={onClose} wide>
      <div className="dialog-body">
        <div className="setup-intro">
          <div>
            <Badge tone="teal">Synthetic example</Badge>
            <h3>Returns policy project</h3>
            <p>
              Find the changed customer outcome. Decide which behavior should
              survive.
            </p>
          </div>
          <span className="project-mark" aria-hidden="true">
            ↔
          </span>
        </div>
        <div className="form-grid">
          <label>
            Comparison name
            <input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Your display name
            <input
              value={label}
              maxLength={60}
              placeholder="e.g. Yuvraj"
              onChange={(event) => setLabel(event.target.value)}
            />
            <small>
              A label for this identity, not a verified organization account.
            </small>
          </label>
        </div>
        <div className="candidate-selector">
          <label htmlFor="candidate-variant">Candidate</label>
          <select
            id="candidate-variant"
            value={candidate}
            onChange={(event) => setCandidate(event.target.value)}
          >
            <option value="rewrite-v2">Returns rewrite v2</option>
            <option value="corrected-v2">Supplied corrected v2</option>
          </select>
        </div>
        <div className="source-pair">
          <SourcePanel
            side="baseline"
            variant={catalog?.variants.find((item) => item.id === "legacy-v1")}
          />
          <SourcePanel
            side="candidate"
            variant={catalog?.variants.find((item) => item.id === candidate)}
          />
        </div>
        <div className="setup-scope">
          <div>
            <h4>Input scope</h4>
            <p>
              Days 29, 30 and 31. Receipt and final-sale controls. Central
              refund: $100.00.
            </p>
          </div>
          <div>
            <h4>Evidence bundle</h4>
            <p>
              Operations handbook and migration ticket. Conflicting wording
              stays open for human review.
            </p>
          </div>
        </div>
        <fieldset className="model-picker">
          <legend>
            Investigation model <span>Orchestrator + 3 specialists</span>
          </legend>
          {catalog?.models.map((item) => (
            <label
              className={`model-option ${modelId === item.id ? "is-selected" : ""}`}
              key={item.id}
            >
              <input
                type="radio"
                name="model"
                value={item.id}
                checked={modelId === item.id}
                disabled={!item.ready}
                onChange={() => setModelId(item.id)}
              />
              <span>
                <strong>{item.label}</strong>
                <small>
                  {item.ready ? "Verified ready for this session" : item.reason}
                </small>
              </span>
              <Badge tone={item.ready ? "teal" : "neutral"}>
                {item.ready ? "Ready" : "Unavailable"}
              </Badge>
            </label>
          ))}
          {!catalog && <p>Waiting for worker readiness and source manifest.</p>}
        </fieldset>
        <p className="disclosure">
          Live investigation sends only the approved synthetic code, cases and
          policy evidence to NVIDIA. Deterministic comparison runs without AI.
        </p>
        <ErrorNotice message={error} />
        {!ready && (
          <p className="notice">
            Waiting for a current authorized subscription before creating work.
          </p>
        )}
        {catalog && <p className="muted small">Runner: {catalog.runnerMode}</p>}
      </div>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <div>
          <button disabled={!canStart} onClick={() => void start(false)}>
            {busy ? "Starting…" : "Run comparison without AI"}
          </button>
          <button
            className="button-primary"
            disabled={!canStart || !model?.ready}
            title={
              !model?.ready
                ? model?.reason || "Provider readiness not verified"
                : undefined
            }
            onClick={() => void start(true)}
          >
            Analyze comparison
          </button>
        </div>
      </footer>
    </Dialog>
  );
}
