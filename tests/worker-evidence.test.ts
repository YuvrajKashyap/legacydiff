import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readCatalog } from "../backend/worker/catalog.ts";
import { runPython } from "../backend/worker/runner.ts";
import { runnerManifestSchema } from "../packages/contracts/validation.ts";
import type { Artifact } from "../backend/ai/evidence.ts";
import type { Run } from "../packages/contracts/view-model.ts";

async function loaderModule() {
  const module = await import("../backend/worker/evidence-config.ts").catch(
    () => null,
  );
  assert.ok(module, "worker evidence configuration exists");
  return module;
}
test("unconfigured catalog emits all hash-verified local artifact snapshots", async () => {
  const captured: Artifact[] = [];
  await readCatalog(new Set(), (artifact) => {
    captured.push(artifact);
  });
  assert.equal(captured.length, 5);
  assert.ok(
    captured.every(
      (artifact) =>
        artifact.source === "Local fixture" &&
        artifact.commit === null &&
        artifact.url === null,
    ),
  );
});
test("configured evidence resolves five pinned GitHub artifacts and retains fetched provenance on cache fallback", async () => {
  const { createReviewedArtifactLoader } = await loaderModule();
  const manifest = runnerManifestSchema.parse(
    await runPython({ op: "manifest" }),
  );
  const sources = [...manifest.variants, ...manifest.evidence];
  const commit = "a".repeat(40);
  let unavailable = false;
  let fetches = 0;
  const load = createReviewedArtifactLoader({
    commit,
    fetch: async (url) => {
      fetches++;
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get("ref"), commit);
      if (unavailable) return new Response("", { status: 503 });
      const entry = sources.find((item) =>
        parsed.pathname.endsWith("/" + item.file),
      )!;
      const bytes = Buffer.from(entry.source);
      const sha = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      return Response.json({
        type: "file",
        path: `fixtures/returns/${entry.file}`,
        encoding: "base64",
        size: bytes.length,
        sha,
        content: bytes.toString("base64"),
      });
    },
  });
  const live = await load(manifest);
  assert.equal(live.length, 5);
  assert.equal(fetches, 5);
  assert.ok(
    live.every(
      (item) =>
        item.source === "Live" &&
        item.commit === commit &&
        item.gitBlobSha &&
        item.url?.includes(`/blob/${commit}/`),
    ),
  );
  const handbook = live.find((item) => item.id === "operations-handbook")!;
  assert.equal(handbook.startLine, 3);
  assert.equal(handbook.endLine, 4);
  unavailable = true;
  const cached = await load(manifest);
  assert.ok(cached.every((item) => item.source === "Cached"));
  assert.equal(cached[0]!.retrievedAt, live[0]!.retrievedAt);
});
test("branch aliases and missing pinned files cannot fall back to bundled evidence", async () => {
  const { createReviewedArtifactLoader } = await loaderModule();
  assert.throws(
    () => createReviewedArtifactLoader({ commit: "main" }),
    /commit|SHA/,
  );
  const manifest = runnerManifestSchema.parse(
    await runPython({ op: "manifest" }),
  );
  const load = createReviewedArtifactLoader({
    commit: "a".repeat(40),
    fetch: async () => new Response("", { status: 404 }),
  });
  await assert.rejects(load(manifest), /unavailable|snapshot/);
});
test("absent commit makes no network request", async () => {
  const { createReviewedArtifactLoader } = await loaderModule();
  const manifest = runnerManifestSchema.parse(
    await runPython({ op: "manifest" }),
  );
  const load = createReviewedArtifactLoader({
    fetch: async () => {
      throw new Error("Unexpected network request");
    },
  });
  const local = await load(manifest);
  assert.ok(local.every((item) => item.source === "Local fixture"));
});

test("AI artifact lookup preserves frozen run provenance and rejects missing or tampered snapshots", async () => {
  const { artifactsForRun } = await loaderModule();
  const captured: Artifact[] = [];
  const catalog = await readCatalog(new Set(), (artifact) => {
    captured.push(artifact);
  });
  const commit = "a".repeat(40);
  const rows = captured.map((artifact) => {
    const bytes = Buffer.from(artifact.text);
    return {
      key: artifact.id,
      value: {
        ...artifact,
        commit,
        source: "Cached",
        gitBlobSha: createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex"),
        url: `https://github.com/YuvrajKashyap/legacydiff/blob/${commit}/${artifact.path}`,
      },
    };
  });
  const run: Run = {
    id: "run",
    baseline: "legacy-v1",
    candidate: "rewrite-v2",
    modelId: "model",
    createdAt: "now",
    state: "running",
    reviewState: "needs_review",
    sourceVariants: catalog.variants.filter(
      (item) => item.id !== "corrected-v2",
    ),
    evidence: catalog.evidence.map((item) => ({
      ...item,
      provenance: "Cached",
      url: `https://github.com/YuvrajKashyap/legacydiff/blob/${commit}/fixtures/returns/${item.file}`,
    })),
    proposals: [],
    decisions: [],
    comments: [],
    pins: [],
    activity: [],
  };
  const artifacts = artifactsForRun(run, rows);
  assert.equal(artifacts.length, 4);
  assert.ok(
    artifacts.every(
      (item) => item.source === "Cached" && item.commit === commit,
    ),
  );
  assert.throws(() => artifactsForRun(run, []), /unavailable/);
  const tampered = structuredClone(rows);
  tampered[0]!.value.text = "changed after run";
  assert.throws(() => artifactsForRun(run, tampered), /provenance|bytes/);
});
