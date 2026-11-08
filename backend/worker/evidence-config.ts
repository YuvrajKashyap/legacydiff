/** Loads reviewed evidence and finds the saved files used by earlier returns runs. */
import { createHash } from "node:crypto";
import { createEvidenceReader, localArtifact } from "../ai/evidence";
import type { Artifact } from "../ai/evidence";
import type { RunnerManifest } from "../../packages/contracts/validation";
import type { Run } from "../../packages/contracts/view-model";
import type { ArtifactSnapshot } from "../../packages/client/generated/types";

export type OnArtifact = (artifact: Artifact) => void | Promise<void>;

/** The reviewed file list supplies paths and content hashes. Settings choose one exact Git commit. */
export function createReviewedArtifactLoader(
  options: { commit?: string; fetch?: typeof fetch } = {},
) {
  const commit = options.commit;
  if (commit && !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(
      "GITHUB_EVIDENCE_COMMIT must be a full lowercase 40-character commit SHA, never a branch or tag.",
    );
  }
  let previousManifestKey: string | undefined;
  let remoteReader: ReturnType<typeof createEvidenceReader> | undefined;
  return async (manifest: RunnerManifest): Promise<Artifact[]> => {
    const entries = [...manifest.variants, ...manifest.evidence];
    const specs = entries.map((entry) => ({
      id: entry.id,
      path: `fixtures/returns/${entry.file}`,
      sha256: entry.sha256,
    }));
    const key = JSON.stringify(specs);
    let artifacts: Artifact[];
    if (!commit) {
      artifacts = entries.map((entry, index) =>
        localArtifact(specs[index]!, entry.source),
      );
    } else {
      if (!remoteReader || previousManifestKey !== key) {
        remoteReader = createEvidenceReader(
          specs.map((spec) => ({ ...spec, commit })),
          { fetch: options.fetch },
        );
        previousManifestKey = key;
      }
      // Require all five files. A failed download must not be replaced with a local file.
      artifacts = await Promise.all(
        specs.map((spec) => remoteReader!.read(spec.id)),
      );
    }
    return artifacts.map((artifact) => {
      const evidence = manifest.evidence.find(
        (entry) => entry.id === artifact.id,
      );
      return evidence
        ? {
            ...artifact,
            startLine: evidence.line_start,
            endLine: evidence.line_end,
          }
        : artifact;
    });
  };
}

/** Use the files and source details saved for this run, not today's catalog. */
export function artifactsForRun(
  run: Run,
  snapshots: readonly ArtifactSnapshot[],
): Artifact[] {
  if (!run.sourceVariants?.length)
    throw new Error("Frozen run sources are unavailable for investigation.");
  const remoteEvidence = run.evidence.filter(
    (evidence) => evidence.provenance !== "Local fixture",
  );
  const commits = remoteEvidence.map((evidence) => {
    const expectedPath = `fixtures/returns/${evidence.file}`;
    const match = evidence.url?.match(
      /^https:\/\/github\.com\/YuvrajKashyap\/legacydiff\/blob\/([a-f0-9]{40})\/(.+)$/,
    );
    if (!match || match[2] !== expectedPath)
      throw new Error("Run evidence has no valid pinned GitHub URL.");
    return match[1]!;
  });
  if (
    new Set(commits).size > 1 ||
    (remoteEvidence.length > 0 && remoteEvidence.length !== run.evidence.length)
  ) {
    throw new Error(
      "Run evidence must belong to one consistent pinned source bundle.",
    );
  }
  const commit = commits[0];
  const entries = [
    ...run.evidence.map((entry) => ({
      id: entry.id,
      file: entry.file,
      sha256: entry.sha256,
      text: entry.text,
      source: entry.provenance,
    })),
    ...run.sourceVariants.map((entry) => ({
      id: entry.id,
      file: entry.file,
      sha256: entry.sha256,
      text: entry.source,
      source: undefined as Artifact["source"] | undefined,
    })),
  ];
  return entries.map((entry) => {
    const spec = {
      id: entry.id,
      path: `fixtures/returns/${entry.file}`,
      sha256: entry.sha256,
    };
    if (!commit) return localArtifact(spec, entry.text);
    const stored = snapshots.find(
      (snapshot) =>
        snapshot.value.id === entry.id &&
        snapshot.value.sha256 === entry.sha256 &&
        snapshot.value.commit === commit,
    )?.value;
    if (!stored || (stored.source !== "Live" && stored.source !== "Cached"))
      throw new Error("Pinned remote artifact snapshot unavailable.");
    const bytes = Buffer.from(stored.sourceBytesBase64, "base64");
    const expectedUrl = `https://github.com/YuvrajKashyap/legacydiff/blob/${commit}/${spec.path}`;
    if (
      stored.repository !== "YuvrajKashyap/legacydiff" ||
      stored.path !== spec.path ||
      stored.url !== expectedUrl ||
      stored.text !== entry.text ||
      bytes.toString("utf8") !== entry.text ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256 ||
      createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex") !== stored.gitBlobSha
    ) {
      throw new Error(
        "Pinned remote artifact provenance or bytes do not match this run.",
      );
    }
    return {
      ...stored,
      repository: "YuvrajKashyap/legacydiff",
      commit,
      gitBlobSha: stored.gitBlobSha ?? null,
      url: stored.url ?? null,
      source: entry.source ?? stored.source,
    };
  });
}
