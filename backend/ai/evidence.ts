/** Fetches only approved source files and checks their contents, origin, and quoted lines. */
import { createHash } from "node:crypto";
import { z } from "zod";
const MAX_SOURCE = 48 * 1024;
const artifactSpec = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    path: z
      .string()
      .regex(/^fixtures\/returns\/[a-zA-Z0-9_./-]+$/)
      .refine((p) => !p.split("/").includes("..")),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const pinnedSpec = artifactSpec.extend({
  commit: z
    .string()
    .regex(/^[a-f0-9]{40}$/, "A full pinned commit is required"),
});
export type ArtifactSpec = z.infer<typeof artifactSpec>;
export type PinnedArtifactSpec = z.infer<typeof pinnedSpec>;
export type Artifact = ArtifactSpec & {
  repository: "YuvrajKashyap/legacydiff";
  commit: string | null;
  gitBlobSha: string | null;
  text: string;
  sourceBytesBase64: string;
  source: "Live" | "Cached" | "Local fixture";
  retrievedAt: string;
  url: string | null;
  startLine: number;
  endLine: number;
};
export const citationSchema = z
  .object({
    artifact_id: z.string().min(1).max(80),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
    quote: z.string().min(1).max(4096),
  })
  .strict();
export type Citation = z.infer<typeof citationSchema>;
/** Give the model ready-made quotes to select, so it does not have to count lines or copy spacing. */
export function citationCatalog(artifacts: { id: string; source: string }[]) {
  return artifacts.flatMap((artifact, artifactIndex) =>
    artifact.source
      .slice(0, 6000)
      .split("\n")
      .map((line, index) => ({
        id: `source-${artifactIndex + 1}-line-${index + 1}`,
        citation: {
          artifact_id: artifact.id,
          start_line: index + 1,
          end_line: index + 1,
          quote: line.slice(0, 300),
        },
      }))
      .filter((item) => item.citation.quote.trim().length > 0)
      .slice(0, 64),
  );
}
/** Stop reading if a server sends more data than we allow. */
export async function boundedBody(
  response: Response,
  limit: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new Error("Response size limit exceeded");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function checkedText(spec: ArtifactSpec, bytes: Buffer) {
  if (bytes.length > MAX_SOURCE)
    throw new Error("Artifact size limit exceeded");
  if (createHash("sha256").update(bytes).digest("hex") !== spec.sha256)
    throw new Error("Artifact hash mismatch");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function localArtifact(raw: ArtifactSpec, text: string): Artifact {
  const spec = artifactSpec.parse(raw);
  const bytes = Buffer.from(text);
  const checked = checkedText(spec, bytes);
  return {
    ...spec,
    repository: "YuvrajKashyap/legacydiff",
    commit: null,
    gitBlobSha: null,
    text: checked,
    sourceBytesBase64: bytes.toString("base64"),
    source: "Local fixture",
    retrievedAt: new Date().toISOString(),
    url: null,
    startLine: 1,
    endLine: checked.split("\n").length,
  };
}
export function validateCitation(
  raw: Citation,
  artifacts: readonly Artifact[],
): Citation {
  const citation = citationSchema.parse(raw);
  const artifact = artifacts.find((a) => a.id === citation.artifact_id);
  if (!artifact) throw new Error("Citation artifact is unavailable");
  const lines = artifact.text.split("\n");
  if (
    citation.end_line < citation.start_line ||
    citation.end_line > lines.length
  )
    throw new Error("Citation line range is invalid");
  const excerpt = lines
    .slice(citation.start_line - 1, citation.end_line)
    .join("\n");
  if (!excerpt.includes(citation.quote))
    throw new Error("Citation quotation does not occur in the cited lines");
  return citation;
}
/** The server lists approved files at one exact Git commit. The model cannot choose a URL. */
export function createEvidenceReader(
  specs: readonly PinnedArtifactSpec[],
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
  } = {},
) {
  const allowlist = new Map(
    specs.map((raw) => {
      const spec = pinnedSpec.parse(raw);
      return [spec.id, spec];
    }),
  );
  if (allowlist.size !== specs.length)
    throw new Error("Duplicate artifact IDs");
  const cache = new Map<string, Artifact>();
  const request = options.fetch ?? fetch;
  return {
    async read(id: string, signal?: AbortSignal): Promise<Artifact> {
      const spec = allowlist.get(id);
      if (!spec) throw new Error("Artifact is not in the server allowlist");
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 15000);
      const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
      try {
        combined.throwIfAborted();
        const path = spec.path.split("/").map(encodeURIComponent).join("/");
        const response = await request(
          `https://api.github.com/repos/YuvrajKashyap/legacydiff/contents/${path}?ref=${spec.commit}`,
          {
            method: "GET",
            redirect: "error",
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2026-03-10",
              "User-Agent": "LegacyDiff-local-demo",
            },
            signal: combined,
          },
        );
        if (!response.ok) throw new Error("GitHub unavailable");
        const data = z
          .object({
            type: z.literal("file"),
            path: z.literal(spec.path),
            encoding: z.literal("base64"),
            size: z.number().int().min(0).max(MAX_SOURCE),
            sha: z.string().regex(/^[a-f0-9]{40}$/),
            content: z.string().max(MAX_SOURCE * 2),
          })
          .parse(
            JSON.parse(await boundedBody(response, MAX_SOURCE * 2 + 8192)),
          );
        const encoded = data.content.replace(/\s/g, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
          throw new Error("Invalid content encoding");
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.length !== data.size)
          throw new Error("Artifact size mismatch");
        const text = checkedText(spec, bytes);
        const blob = createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex");
        if (blob !== data.sha) throw new Error("Git blob hash mismatch");
        const artifact: Artifact = {
          ...spec,
          repository: "YuvrajKashyap/legacydiff",
          gitBlobSha: blob,
          text,
          sourceBytesBase64: bytes.toString("base64"),
          source: "Live",
          retrievedAt: new Date().toISOString(),
          url: `https://github.com/YuvrajKashyap/legacydiff/blob/${spec.commit}/${path}`,
          startLine: 1,
          endLine: text.split("\n").length,
        };
        cache.set(id, artifact);
        return structuredClone(artifact);
      } catch {
        if (signal?.aborted) throw new Error("Evidence retrieval cancelled");
        const previous = cache.get(id);
        if (
          previous &&
          previous.commit === spec.commit &&
          previous.sha256 === spec.sha256
        )
          return { ...structuredClone(previous), source: "Cached" };
        throw new Error(
          "Pinned evidence unavailable; no matching fetched snapshot exists",
        );
      }
    },
  };
}
