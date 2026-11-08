/** Show the saved source code, where it came from, and the hash that identifies its exact contents. */
import type { SourceVariant } from "../view-model";
import { variantLabel } from "../presentation";

export function SourcePanel({
  variant,
  side,
}: {
  variant?: SourceVariant;
  side: "baseline" | "candidate";
}) {
  return (
    <section className={`source-panel source-panel--${side}`}>
      <span className="eyebrow">
        {side === "baseline"
          ? "Baseline · old behavior"
          : "Candidate · proposed replacement"}
      </span>
      <h3>{variant ? variantLabel(variant.id) : "Source unavailable"}</h3>
      {variant && (
        <>
          <dl className="source-meta">
            <div>
              <dt>File</dt>
              <dd>{variant.file}</dd>
            </div>
            <div>
              <dt>Entry point</dt>
              <dd>
                <code>{variant.entry_point}</code>
              </dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{variant.revision}</dd>
            </div>
          </dl>
          <details>
            <summary>Source preview</summary>
            <pre>{variant.source}</pre>
          </details>
          <p className="fingerprint" title={variant.sha256}>
            SHA256 <code>{variant.sha256}</code>
          </p>
        </>
      )}
    </section>
  );
}
