/** Let the user choose a scenario and run its examples, with optional AI analysis when a model is available. */
import { useState } from "react";
import type { LegacyDiffState, RunAddress } from "../view-model";
import { Badge, Dialog, ErrorNotice } from "./Primitives";

export function ScenarioSetup({
  state,
  onClose,
  onStarted,
  onClassic,
}: {
  state: LegacyDiffState;
  onClose: () => void;
  onStarted: (address: RunAddress) => void;
  onClassic: () => void;
}) {
  const [selected, setSelected] = useState(state.scenarios[0]?.id);
  const [sourcePair, setSourcePair] = useState<{
    scenarioId: string;
    baseline: string;
    candidate: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [label, setLabel] = useState(
    () => localStorage.getItem("legacydiff.displayName") || "yxk220038",
  );
  const [modelId, setModelId] = useState("");
  // The model list may arrive after this screen opens; use its first option when no choice exists yet.
  const selectedModelId =
    modelId ||
    state.catalog?.models.find((item) => item.ready)?.id ||
    state.catalog?.models[0]?.id ||
    "";
  const model = state.catalog?.models.find(
    (item) => item.id === selectedModelId,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scenario =
    state.scenarios.find((item) => item.id === selected) || state.scenarios[0];
  // A different scenario starts with its own defaults, never the previous scenario's sources.
  const pair = sourcePair?.scenarioId === scenario?.id ? sourcePair : null;
  const baseline = pair?.baseline || scenario?.baseline || "";
  const candidate = pair?.candidate || scenario?.candidate || "";
  const validPair =
    baseline !== candidate &&
    !!scenario?.variants.some((item) => item.id === baseline) &&
    !!scenario.variants.some((item) => item.id === candidate);
  function chooseSource(side: "baseline" | "candidate", value: string) {
    if (!scenario) return;
    setSourcePair({
      scenarioId: scenario.id,
      baseline,
      candidate,
      [side]: value,
    });
  }
  // Start only after the user asks. Open the exact room and run returned after the server saves them.
  async function start(withAi: boolean) {
    if (
      !state.ready ||
      busy ||
      !label.trim() ||
      !scenario ||
      !validPair ||
      (withAi && !model?.ready)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const address = await state.scenarioActions.start({
        scenarioId: scenario.id,
        baseline,
        candidate,
        name: name.trim() || scenario.title,
        label: label.trim(),
        modelId: selectedModelId,
        withAi,
        requestId: crypto.randomUUID(),
      });
      localStorage.setItem("legacydiff.displayName", label.trim());
      onStarted(address);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Choose a comparison" onClose={onClose} wide>
      <div className="scenario-setup">
        <p>
          Run a reviewed source pair against a synthetic dataset, then decide
          which behavior should become an executable expectation.
        </p>
        <p className="notice">
          Synthetic demo data. Results appear only after the worker executes the
          selected sources.
        </p>
        <div
          className="scenario-picker"
          role="group"
          aria-label="Comparison scenario"
        >
          {state.scenarios.map((item) => (
            <button
              key={item.id}
              className={`scenario-option ${scenario?.id === item.id ? "is-selected" : ""}`}
              aria-pressed={scenario?.id === item.id}
              disabled={busy}
              onClick={() => {
                setSelected(item.id);
                setSourcePair(null);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
              <small>
                {item.dataset.count} cases · {item.dataset.categories.length}{" "}
                categories
              </small>
            </button>
          ))}
        </div>
        {!scenario && (
          <p className="notice">
            Waiting for the scenario catalog from the worker.
          </p>
        )}
        {scenario && (
          <section className="scenario-dataset">
            <Badge>{scenario.dataset.version}</Badge>
            <h3>{scenario.title}</h3>
            <p>Decision owner · {scenario.decision_owner}</p>
            <p>{scenario.dataset.categories.join(" · ")}</p>
            <p className="small">
              Source pair <code>{baseline}</code> → <code>{candidate}</code>
            </p>
            <details>
              <summary>Dataset provenance</summary>
              <code className="scenario-hash">
                SHA-256 {scenario.dataset.sha256}
              </code>
              <p className="small">
                Synthetic fixture inputs. Expected behavior is chosen separately
                during review.
              </p>
            </details>
          </section>
        )}
        {scenario && (
          <div className="scenario-source-grid">
            <label htmlFor="scenario-baseline">
              Baseline source
              <select
                id="scenario-baseline"
                value={baseline}
                disabled={busy}
                onChange={(event) =>
                  chooseSource("baseline", event.target.value)
                }
              >
                {scenario.variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="scenario-candidate">
              Candidate source
              <select
                id="scenario-candidate"
                value={candidate}
                disabled={busy}
                onChange={(event) =>
                  chooseSource("candidate", event.target.value)
                }
              >
                {scenario.variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {scenario && !validPair && (
          <p className="notice">
            Choose two different bundled source versions.
          </p>
        )}
        <label>
          Comparison name
          <input
            value={name}
            maxLength={100}
            placeholder={scenario?.title || "Comparison name"}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Your display name
          <input
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label htmlFor="scenario-model">Investigation model</label>
        <select
          id="scenario-model"
          value={selectedModelId}
          onChange={(event) => setModelId(event.target.value)}
        >
          {state.catalog?.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.ready ? "" : " · unavailable"}
            </option>
          ))}
        </select>
        <p className="small muted">
          {model?.ready
            ? "Analyze executes the corpus first, then asks this model to investigate the measured differences. Approval always remains a human decision."
            : model?.reason ||
              "Waiting for verified model readiness. The deterministic corpus can run independently."}
        </p>
        <ErrorNotice message={error} />
        <div className="scenario-actions">
          <button
            className="button-primary"
            disabled={
              !state.ready ||
              !scenario ||
              !validPair ||
              !label.trim() ||
              busy ||
              !model?.ready
            }
            onClick={() => void start(true)}
          >
            {busy ? "Starting…" : "Compare + investigate with AI"}
          </button>
          <button
            className="button-primary"
            disabled={
              !state.ready || !scenario || !validPair || !label.trim() || busy
            }
            onClick={() => void start(false)}
          >
            {busy ? "Starting…" : "Compare without AI"}
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onClassic}
          >
            Classic returns investigation
          </button>
        </div>
      </div>
    </Dialog>
  );
}
