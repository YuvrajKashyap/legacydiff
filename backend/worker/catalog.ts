/** Lists the reviewed returns files and models that have passed a real check since startup. */
import { runnerManifestSchema } from "../../packages/contracts/validation";
import { approvedCases } from "../../packages/contracts/review";
import { modelRegistry } from "../ai/index";
import { runPython } from "./runner";
import type { Catalog } from "../../packages/contracts/view-model";
import { createReviewedArtifactLoader } from "./evidence-config";
import type { OnArtifact } from "./evidence-config";

const loadArtifacts = createReviewedArtifactLoader({
  commit: process.env.GITHUB_EVIDENCE_COMMIT || undefined,
});

export async function readCatalog(
  verifiedModels: ReadonlySet<string> = new Set(),
  onArtifact?: OnArtifact,
): Promise<Catalog> {
  const manifest = runnerManifestSchema.parse(
    await runPython({ op: "manifest" }),
  );
  const artifacts = await loadArtifacts(manifest);
  // Save where every file came from before telling clients the catalog is ready.
  for (const artifact of artifacts) await onArtifact?.(artifact);
  return {
    variants: manifest.variants.map((v) => ({
      ...v,
      source: artifacts.find((artifact) => artifact.id === v.id)!.text,
    })),
    evidence: manifest.evidence.map((e) => {
      const artifact = artifacts.find((item) => item.id === e.id)!;
      return {
        id: e.id,
        title:
          e.id === "operations-handbook"
            ? "Operations handbook"
            : "Migration ticket",
        text: artifact.text,
        sha256: e.sha256,
        file: e.file,
        lineStart: e.line_start,
        lineEnd: e.line_end,
        provenance: artifact.source,
        url: artifact.url ?? undefined,
      };
    }),
    models: modelRegistry(process.env.NVIDIA_API_KEY, verifiedModels),
    runnerMode: manifest.runner_mode,
    expectedCases: {
      include: approvedCases("include"),
      exclude: approvedCases("exclude"),
    },
  };
}
