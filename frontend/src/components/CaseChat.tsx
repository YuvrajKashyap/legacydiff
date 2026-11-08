import { AiText } from "./AiText";
/** Ask about this saved comparison. Only backend-saved answers appear in the conversation. */
import { useState } from "react";
import type {
  CaseChatTurn,
  ScenarioRun,
} from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";
import { displayTime } from "../presentation";
import { ErrorNotice } from "./Primitives";
import "../styles/case-chat.css";

const QUESTION_LIMIT = 2000;
const TURN_LIMIT = 20;

export function CaseChat({
  run,
  state,
}: {
  run: ScenarioRun;
  state: LegacyDiffState;
}) {
  const draftKey = `legacydiff.caseChat:${state.identity}:${run.id}`;
  const [question, setQuestion] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey) || "";
    } catch {
      return "";
    }
  });
  const [chosenModel, setChosenModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const turns = run.chat || [];
  // Keep the latest exchange easy to find without removing earlier answers or failures.
  const earlierTurns = turns.slice(0, -2);
  const recentTurns = turns.slice(-2);
  const pending = turns.some(
    (turn) => turn.state === "queued" || turn.state === "running",
  );
  const awaitingRecord =
    !!submittedId && !turns.some((turn) => turn.requestId === submittedId);
  const models = state.catalog?.models || [];
  const modelId =
    chosenModel ||
    models.find((model) => model.ready && model.id.includes("ultra"))?.id ||
    models.find((model) => model.ready)?.id ||
    models[0]?.id ||
    "";
  const model = models.find((item) => item.id === modelId);
  const canSend =
    state.ready &&
    !!run.comparison &&
    !!model?.ready &&
    !busy &&
    !pending &&
    !awaitingRecord &&
    turns.length < TURN_LIMIT &&
    !!question.trim() &&
    question.length <= QUESTION_LIMIT;
  function updateQuestion(value: string) {
    setQuestion(value);
    try {
      sessionStorage.setItem(draftKey, value);
    } catch {
      /* The visible draft still works when browser storage is unavailable. */
    }
  }
  async function ask() {
    if (!canSend) return;
    setBusy(true);
    setError("");
    const requestId = crypto.randomUUID();
    try {
      // The server saves which proposal, decision and examples this answer used.
      await state.scenarioActions.ask({
        roomId: run.roomId,
        runId: run.id,
        modelId,
        question: question.trim(),
        expectedRevision: run.revision,
        expectedDecisionVersion: run.decisionVersion,
        requestId,
      });
      setSubmittedId(requestId);
      updateQuestion("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  const blocked = !state.ready
    ? "Reconnect to send."
    : !run.comparison
      ? "Waiting for measured results."
      : turns.length >= TURN_LIMIT
        ? "Question limit reached."
        : !model?.ready
          ? model?.reason || "Model unavailable."
          : "";
  return (
    <section
      className="scenario-card case-chat"
      aria-label="Ask about this comparison"
    >
      <h2>Ask about this comparison</h2>
      {turns.length > 0 && (
        <div className="case-chat-history" aria-label="Conversation">
          {earlierTurns.length > 0 && (
            <details className="case-chat-earlier">
              <summary>Earlier questions ({earlierTurns.length})</summary>
              <div className="case-chat-older-turns">
                {earlierTurns.map((turn) => (
                  <ChatTurn key={turn.id} turn={turn} run={run} state={state} />
                ))}
              </div>
            </details>
          )}
          {recentTurns.map((turn) => (
            <ChatTurn key={turn.id} turn={turn} run={run} state={state} />
          ))}
        </div>
      )}
      <form
        className="case-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <textarea
          aria-label="Your question"
          value={question}
          maxLength={QUESTION_LIMIT}
          rows={2}
          disabled={busy}
          onChange={(event) => updateQuestion(event.target.value)}
          placeholder="Ask a question…"
        />
        <div className="case-chat-controls">
          <select
            aria-label="Nemotron model"
            value={modelId}
            disabled={busy}
            onChange={(event) => setChosenModel(event.target.value)}
          >
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.ready ? "" : " · unavailable"}
              </option>
            ))}
          </select>
          <button className="button-primary" type="submit" disabled={!canSend}>
            {busy
              ? "Sending…"
              : pending || awaitingRecord
                ? "Waiting…"
                : "Send"}
          </button>
        </div>
        {blocked && <p className="case-chat-help">{blocked}</p>}
        <ErrorNotice message={error} />
      </form>
    </section>
  );
}

function ChatTurn({
  turn,
  run,
  state,
}: {
  turn: CaseChatTurn;
  run: ScenarioRun;
  state: LegacyDiffState;
}) {
  const room = state.rooms.find((item) => item.id === run.roomId);
  const author =
    room?.members.find((item) => item.identity === turn.author)?.label ||
    "Room member";
  const response = turn.response;
  const olderContext =
    turn.context.revision !== run.revision ||
    turn.context.decisionVersion !== run.decisionVersion;
  return (
    <article className="case-chat-turn">
      <div className="case-chat-question">
        <header>
          <strong>{author}</strong>
          <span>{displayTime(turn.createdAt)}</span>
        </header>
        <p>{turn.question}</p>
      </div>
      <div className="case-chat-answer">
        <header>
          <strong>AI response</strong>
        </header>
        {response ? (
          <div>
            <AiText text={response.answer} />
          </div>
        ) : (
          <p
            className="case-chat-pending"
            role={
              turn.state === "queued" || turn.state === "running"
                ? "status"
                : undefined
            }
          >
            {turn.state === "queued"
              ? "Queued…"
              : turn.state === "running"
                ? "Thinking…"
                : turn.state === "cancelled"
                  ? "This request was cancelled. No answer was recorded."
                  : turn.state === "failed"
                    ? turn.error ||
                      "The request failed. No answer was recorded."
                    : "No answer content was recorded."}
          </p>
        )}
        {response && turn.error && <ErrorNotice message={turn.error} />}
        {olderContext && (
          <p className="case-chat-help">Earlier proposal version.</p>
        )}
        {response?.citations.length ? (
          <details>
            <summary>Sources cited · {response.citations.length}</summary>
            {response.citations.map((citation, index) => {
              const artifact =
                run.manifest.evidence.find(
                  (item) => item.id === citation.artifact_id,
                ) ||
                run.manifest.variants.find(
                  (item) => item.id === citation.artifact_id,
                );
              return (
                <div key={`${citation.artifact_id}:${index}`}>
                  <p>
                    <strong>{artifact?.file || citation.artifact_id}</strong> ·
                    lines {citation.start_line}–{citation.end_line}
                  </p>
                  <p>“{citation.quote}”</p>
                  {artifact && (
                    <code className="scenario-hash">
                      SHA-256 {artifact.sha256}
                    </code>
                  )}
                </div>
              );
            })}
          </details>
        ) : null}
        <details>
          <summary>Model & saved context</summary>
          <p>
            Requested model · {turn.requestedModelId}
            <br />
            Actual model · {response?.actualModelId || "No response recorded"}
            {response && (
              <>
                <br />
                Response time · {response.durationMs} ms
              </>
            )}
          </p>
          <p>
            Proposal revision {turn.context.revision} · decision version{" "}
            {turn.context.decisionVersion}
            <br />
            Included examples ·{" "}
            {turn.context.caseIds.join(", ") || "None recorded"}
            <br />
            Prior answers included · {turn.context.priorTurnIds.length}
          </p>
          {response && (
            <p>
              Examples cited by the answer ·{" "}
              {response.caseIds.join(", ") || "None"}
            </p>
          )}
          <code className="scenario-hash">
            Dataset SHA-256 {turn.context.datasetHash}
          </code>
          <code className="scenario-hash">
            Candidate SHA-256 {turn.context.candidateHash}
          </code>
        </details>
      </div>
    </article>
  );
}
