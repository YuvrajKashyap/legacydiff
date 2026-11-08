/** Point to the next human action using recorded results and already compared supplied sources. */
import type { ScenarioRun } from "../../../packages/contracts/scenarios";
import type { LegacyDiffState } from "../view-model";

export function ComparisonNextStep({
  run,
  state,
}: {
  run: ScenarioRun;
  state: LegacyDiffState;
}) {
  const result = run.comparison;
  if (!result) return null;
  const unmet = result.requirements.filter(
    (item) => item.candidate === "fail",
  ).length;
  const problems = result.error_count;
  const title = problems
    ? "First, resolve execution problems"
    : unmet
      ? "The candidate violates recorded rules"
      : result.mismatch_count
        ? "Decide which behavior is intended"
        : "Review the matching result before approval";
  const description = problems
    ? "A crash, timeout or invalid output prevents a complete comparison. Inspect the affected examples before deciding what should happen."
    : unmet
      ? "Running without a crash is not enough. Inspect the unmet requirements, then defer this decision or review a supplied corrected version."
      : result.mismatch_count
        ? "The versions disagree. Read the policy evidence, choose the intended behavior, and preview the exact expectations before approving."
        : "The versions agree on these examples. Check the rule coverage and evidence, then explicitly approve the intended policy or defer it.";
  const correctedVariants = run.manifest.variants.filter((item) =>
    item.id.includes("corrected"),
  );
  const alreadyCorrected = correctedVariants.some(
    (item) => item.id === run.manifest.candidate,
  );
  const baselineHash = run.manifest.variants.find(
    (item) => item.id === run.manifest.baseline,
  )?.sha256;
  // Only link an actual saved comparison of the same inputs and baseline, never claim a correction passed.
  const corrected = state.scenarioRuns
    .filter(
      (item) =>
        item.id !== run.id &&
        item.scenarioId === run.scenarioId &&
        item.manifest.baseline === run.manifest.baseline &&
        item.manifest.dataset.sha256 === run.manifest.dataset.sha256 &&
        item.manifest.variants.find(
          (source) => source.id === item.manifest.baseline,
        )?.sha256 === baselineHash &&
        correctedVariants.some(
          (source) => source.id === item.manifest.candidate,
        ) &&
        !!item.comparison,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const correctedResult = corrected?.comparison;
  return (
    <section
      className="comparison-next-step"
      aria-label="Recommended next step"
    >
      <div>
        <span className="eyebrow">Next step</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <a
          href={
            problems
              ? "#measured-behavior"
              : unmet
                ? "#independent-requirements"
                : "#policy-review"
          }
        >
          {problems
            ? "Inspect execution problems"
            : unmet
              ? "Inspect unmet requirements"
              : "Review intended policy"}{" "}
          →
        </a>
      </div>
      {!alreadyCorrected && correctedVariants.length > 0 && (
        <aside>
          <strong>Supplied corrected version</strong>
          {corrected && correctedResult ? (
            <>
              <p>
                {corrected.manifest.candidate} has a saved comparison against
                the same baseline and dataset.
              </p>
              <p className="small">
                {correctedResult.mismatch_count} /{" "}
                {correctedResult.cases.length} differing cases ·{" "}
                {correctedResult.error_count} execution problems ·{" "}
                {correctedResult.requirements.length
                  ? `${correctedResult.requirements.filter((item) => item.candidate === "fail").length} candidate checks unmet`
                  : "Independent checks not recorded"}
              </p>
              <a
                href={`?room=${encodeURIComponent(corrected.roomId)}&run=${encodeURIComponent(corrected.id)}`}
              >
                Inspect corrected comparison →
              </a>
              <p className="small muted">
                Inspect its results and make a separate approval decision.
              </p>
            </>
          ) : (
            <>
              <p>
                The supplied source{" "}
                {correctedVariants.map((item) => item.id).join(", ")} has no
                saved matching comparison yet.
              </p>
              <p className="small muted">
                Start a new comparison with this baseline and the corrected
                candidate. No repair or approval is performed automatically.
              </p>
            </>
          )}
        </aside>
      )}
    </section>
  );
}
