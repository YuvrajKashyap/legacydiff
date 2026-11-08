import { AiText } from "./AiText";
import { InvestigationHistory } from "./InvestigationHistory";
/** Show measured examples a page at a time and display AI notes separately from approved expectations. */
import { useState } from "react";
import type {
  ScenarioRun,
  SuiteComparison,
} from "../../../packages/contracts/scenarios";
import { Badge } from "./Primitives";
import { Ticker } from "../motion/components";
const json = (value: unknown) => JSON.stringify(value, null, 2);
/** Explain the three independent questions before showing detailed evidence. */
export function OutcomeGuide({ run }: { run: ScenarioRun }) {
  const result = run.comparison;
  if (!result) return null;
  const unmet = result.requirements.filter(
    (item) => item.candidate === "fail",
  ).length;
  const unchecked = result.requirements.filter(
    (item) => item.candidate === "error",
  ).length;
  const baselineUnmet = result.requirements.filter(
    (item) => item.baseline === "fail",
  ).length;
  return (
    <section className="outcome-guide" aria-label="What these results mean">
      <div className="outcome-intro">
        <span className="eyebrow">Read the result in three parts</span>
        <h2>Did it run? What changed? Does it meet the rules?</h2>
        <p>
          Baseline is the older version. Candidate is the version you are
          evaluating. None of these results is a human approval.
        </p>
      </div>
      <div className="outcome-cards">
        <a href="#measured-behavior">
          <span className="outcome-number">
            <Ticker value={result.error_count} />
          </span>
          <strong>Execution problems</strong>
          <p>
            {result.error_count
              ? "Some inputs could not produce usable outputs. Inspect their crash, timeout or error details."
              : "Both versions returned usable outputs for every input. This says nothing yet about whether those outputs are correct."}
          </p>
        </a>
        <a href="#measured-behavior">
          <span className="outcome-number">
            <Ticker value={result.mismatch_count} />
            <small> / {result.cases.length}</small>
          </span>
          <strong>Inputs with different outputs</strong>
          <p>
            {result.mismatch_count
              ? "The two versions disagree on these inputs. A change may be a regression, an intentional change or a fix to an old bug."
              : "Both versions agree on these inputs. They could still share a defect, so check the requirements too."}
          </p>
        </a>
        <a
          href="#independent-requirements"
          className={unmet ? "has-unmet" : ""}
        >
          <span className="outcome-number">
            {result.requirements.length ? <Ticker value={unmet} /> : "—"}
          </span>
          <strong>Candidate requirement checks unmet</strong>
          <p>
            {!result.requirements.length
              ? "No independent requirement checks were recorded for this comparison."
              : unchecked
                ? `${unchecked} checks could not be evaluated because execution failed. The remaining recorded results are shown below.`
                : unmet
                  ? "The candidate ran but broke these recorded rules. Several checks may describe the same underlying defect."
                  : "No candidate rule violations were found by the recorded checks. This is limited to the inputs and rules shown here."}
          </p>
          <small>
            Baseline: {baselineUnmet} unmet checks. These counts are not
            separate bugs.
          </small>
        </a>
      </div>
      <nav className="workflow-jumps" aria-label="Comparison workflow">
        <a href="#measured-behavior">1. Inspect outputs</a>
        <a href="#independent-requirements">2. Check rules</a>
        <a
          href={`?view=lab&room=${encodeURIComponent(run.roomId)}&run=${encodeURIComponent(run.id)}`}
        >
          3. Investigate in The Lab
        </a>
        <a href="#policy-review">4. Review the policy</a>
      </nav>
    </section>
  );
}

export function MeasuredCases({
  comparison,
  manifest,
}: {
  comparison: SuiteComparison;
  manifest: ScenarioRun["manifest"];
}) {
  const [filter, setFilter] = useState(
    comparison.error_count
      ? "error"
      : comparison.mismatch_count
        ? "mismatch"
        : "all",
  );
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const cases = comparison.cases.filter(
    (item) =>
      (filter === "all" || item.state === filter) &&
      (category === "all" ||
        manifest.dataset.cases.find((input) => input.id === item.id)
          ?.category === category),
  );
  // Show one page at a time to keep long outputs manageable. Filtering does not change saved results.
  const pageSize = 8;
  const lastPage = Math.max(0, Math.ceil(cases.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  return (
    <section className="scenario-card" id="measured-behavior">
      <h2>
        Measured behavior <Badge>{comparison.mismatch_count} differences</Badge>{" "}
        <Badge tone={comparison.error_count ? "red" : "neutral"}>
          {comparison.error_count} execution problems
        </Badge>
      </h2>
      <p className="muted">
        Open an input below to see exactly what each version returned.
        Differences compare outputs; execution problems mean a crash, timeout or
        unusable output.
      </p>
      <div className="scenario-filters">
        <label>
          Result
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All results</option>
            <option value="mismatch">Differences</option>
            <option value="match">Matches</option>
            <option value="error">Execution problems</option>
          </select>
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All categories</option>
            {manifest.dataset.categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {cases
        .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
        .map((item) => (
          <details className="scenario-case" key={item.id}>
            <summary>
              <strong>{item.id}</strong>
              <Badge
                tone={
                  item.state === "error"
                    ? "red"
                    : item.state === "mismatch"
                      ? "amber"
                      : "teal"
                }
              >
                {item.state === "error" ? "execution problem" : item.state}
              </Badge>
              <span>{item.differences.join(", ")}</span>
            </summary>
            <small>Input</small>
            <pre>{json(item.input)}</pre>
            <div className="scenario-output-grid">
              {(["baseline", "candidate"] as const).map((side) => (
                <div key={side}>
                  <h4 className={`${side}-text`}>{side} observed</h4>
                  <pre>
                    {item[side].status === "success"
                      ? json(item[side].output)
                      : `${item[side].status}: ${item[side].diagnostic || "No output"}`}
                  </pre>
                  <small>{item[side].duration_ms} ms</small>
                  <code className="scenario-hash">
                    SHA-256 {item[side].sha256}
                  </code>
                </div>
              ))}
            </div>
          </details>
        ))}
      {!cases.length && <p>No cases match these filters.</p>}
      <div className="scenario-pagination">
        <button
          disabled={!currentPage}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          {cases.length} cases · page {currentPage + 1} of {lastPage + 1}
        </span>
        <button
          disabled={currentPage >= lastPage}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
      <details>
        <summary>Dataset provenance</summary>
        <code className="scenario-hash">SHA-256 {comparison.dataset_hash}</code>
      </details>
    </section>
  );
}

/** Keep saved specialist findings close to the human decision without expanding the whole investigation. */
export function ScenarioInvestigation({ run }: { run: ScenarioRun }) {
  if (!run.withAi && !run.investigation && !run.investigationState) return null;
  const currentAttempt = run.investigationAttempts?.at(-1);
  const currentOutcome = currentAttempt
    ? currentAttempt.outcome
    : run.investigation;
  let investigation: Record<string, unknown> | null = null;
  let unreadable = false;
  try {
    const parsed: unknown = JSON.parse(currentOutcome || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      investigation = parsed as Record<string, unknown>;
    else if (currentOutcome) unreadable = true;
  } catch {
    // A broken saved result must not look like a successful or still-running investigation.
    unreadable = true;
  }
  const roles = Array.isArray(investigation?.roles)
    ? investigation.roles.filter(
        (role): role is Record<string, unknown> =>
          !!role && typeof role === "object" && !Array.isArray(role),
      )
    : [];
  const actualModels = Array.isArray(investigation?.actualModelIds)
    ? investigation.actualModelIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const overallState =
    currentAttempt?.state ||
    (unreadable
      ? "Saved result unreadable"
      : typeof investigation?.state === "string"
        ? investigation.state
        : run.investigationState || "No result recorded");
  const summaries = [
    {
      id: "behavior",
      title: "Behavior specialist",
      description: "What changed between the two versions",
    },
    {
      id: "policy",
      title: "Policy specialist",
      description: "What the source evidence says the rule should be",
    },
    {
      id: "regression",
      title: "Regression specialist",
      description: "Which examples could protect the intended behavior",
    },
    {
      id: "orchestrator",
      title: "Combined conclusion",
      description: "The orchestrator's synthesis of the specialist findings",
    },
  ];
  const proposals = Array.isArray(investigation?.proposals)
    ? investigation.proposals.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  const latestSuggestion = proposals.at(-1);
  const recommendation =
    latestSuggestion?.recommendation === "APPROVE" ||
    latestSuggestion?.recommendation === "DEFER"
      ? latestSuggestion.recommendation
      : null;
  const labQuery = new URLSearchParams({
    view: "lab",
    room: run.roomId,
    run: run.id,
  });
  return (
    <section
      className="scenario-card scenario-findings"
      aria-label="Saved AI findings"
    >
      <div className="section-heading">
        <h2>
          AI findings{" "}
          <Badge
            tone={
              overallState === "failed" || unreadable
                ? "red"
                : overallState === "partial"
                  ? "amber"
                  : "neutral"
            }
          >
            {overallState}
          </Badge>
        </h2>
        <a href={`?${labQuery}`}>
          {["failed", "partial", "cancelled"].includes(overallState)
            ? "Retry investigation in The Lab →"
            : "Inspect calls in The Lab →"}
        </a>
      </div>
      <p className="small muted">
        Three specialist roles, each with a separate conversation, use the
        selected model. They are not three different model choices. The
        orchestrator combines their findings. These roles review behavior,
        policy evidence and regression examples; they do not certify the
        software as secure.
      </p>
      {typeof investigation?.summary === "string" && (
        <AiText text={investigation.summary} />
      )}
      <p className="small muted">
        Current attempt {run.investigationAttempts?.length || 1}. Earlier
        attempts remain saved below.
      </p>
      <div className="scenario-findings-list">
        {summaries.map((item) => {
          const result = roles.find((role) => role.role === item.id);
          const status =
            typeof result?.state === "string"
              ? result.state
              : "No result recorded";
          const text =
            typeof result?.summary === "string"
              ? result.summary
              : "No saved output is available for this role. Open The Lab to inspect any recorded activity.";
          return (
            <details
              key={item.id}
              className="scenario-finding"
              open={item.id === "orchestrator"}
            >
              <summary>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <Badge tone={status === "failed" ? "red" : "neutral"}>
                  {status}
                </Badge>
                <span className="scenario-finding-toggle" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="scenario-finding-body">
                {item.id === "orchestrator" && recommendation && (
                  <p>
                    <strong>AI recommends {recommendation}</strong>.{" "}
                    {recommendation === "APPROVE"
                      ? "This means reviewing and approving the intended policy, not declaring the candidate ready to ship."
                      : "Keep the decision open until the unresolved questions are addressed."}{" "}
                    A human must make the decision.
                  </p>
                )}
                <AiText text={text} />
                {status === "failed" && (
                  <p className="small muted">
                    This role did not complete successfully. Its saved message
                    is not a confirmed finding.
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
      <p className="small muted">
        Requested model{" "}
        {typeof investigation?.requestedModelId === "string"
          ? investigation.requestedModelId
          : run.modelId || "Not recorded"}
        {actualModels.length > 0 &&
          ` · Actual models ${actualModels.join(", ")}`}
      </p>
      <InvestigationHistory run={run} />
      <p className="small muted">
        These are AI suggestions. Check the evidence and exact expectations
        before approving; no AI output approves a decision.
      </p>
    </section>
  );
}

/** Keep failures easy to see without filling the whole page with passing checks. */
export function IndependentRequirements({
  requirements,
}: {
  requirements: SuiteComparison["requirements"];
}) {
  const [showPassing, setShowPassing] = useState(false);
  const [page, setPage] = useState(0);
  const needsAttention = (item: SuiteComparison["requirements"][number]) =>
    item.baseline !== "pass" || item.candidate !== "pass";
  const problems = requirements.filter(needsAttention);
  const passing = requirements.filter((item) => !needsAttention(item));
  // Failures on either side stay first, including defects shared by both versions.
  const visible = showPassing ? [...problems, ...passing] : problems;
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="scenario-card" id="independent-requirements">
      <h2>Independent requirements</h2>
      <p className="muted">
        These checks evaluate requirements separately from agreement between the
        implementations. Code can run without crashing and still violate a rule.
        Matching outputs can share that defect.
      </p>
      <div className="scenario-actions">
        {(["baseline", "candidate"] as const).map((side) => {
          const failed = requirements.filter(
            (item) => item[side] === "fail",
          ).length;
          const errors = requirements.filter(
            (item) => item[side] === "error",
          ).length;
          return (
            <Badge key={side} tone={failed || errors ? "red" : "neutral"}>
              {side === "baseline" ? "Baseline" : "Candidate"}: {failed} unmet
              requirements · {errors} execution problems
            </Badge>
          );
        })}
      </div>
      <p className="small">
        {problems.length} checks need attention · {passing.length} pass on both
        sides · {requirements.length} reported checks
      </p>
      <label className="scenario-check" htmlFor="requirements-show-passing">
        <input
          id="requirements-show-passing"
          type="checkbox"
          checked={showPassing}
          onChange={(event) => {
            setShowPassing(event.target.checked);
            setPage(0);
          }}
        />
        Also show checks that pass on both sides
      </label>
      {visible
        .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
        .map((item) => (
          <div className="scenario-requirement" key={item.id}>
            <div>
              <strong>{item.description}</strong>
              <small>Case {item.case_id}</small>
            </div>
            <Badge tone={item.baseline === "pass" ? "teal" : "red"}>
              Baseline{" "}
              {item.baseline === "fail"
                ? "requirement unmet"
                : item.baseline === "error"
                  ? "execution problem"
                  : "requirement met"}
            </Badge>
            <Badge tone={item.candidate === "pass" ? "teal" : "red"}>
              Candidate{" "}
              {item.candidate === "fail"
                ? "requirement unmet"
                : item.candidate === "error"
                  ? "execution problem"
                  : "requirement met"}
            </Badge>
          </div>
        ))}
      {!requirements.length ? (
        <p>No independent requirement checks were reported.</p>
      ) : (
        !visible.length && (
          <p>
            No unmet requirements or execution problems were reported by these
            checks. Passing checks are available above.
          </p>
        )
      )}
      {visible.length > 0 && (
        <div className="scenario-pagination">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous requirements
          </button>
          <span>
            Page {currentPage + 1} of {pages} · {visible.length} checks
          </span>
          <button
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next requirements
          </button>
        </div>
      )}
    </section>
  );
}
