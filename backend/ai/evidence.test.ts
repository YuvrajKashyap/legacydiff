import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const text = "Synthetic policy\nReturns are accepted through day 30.\n";
const sha256 = createHash("sha256").update(text).digest("hex");
const sha = createHash("sha1")
  .update(`blob ${Buffer.byteLength(text)}\0`)
  .update(text)
  .digest("hex");
const spec = {
  id: "handbook",
  path: "fixtures/returns/handbook.md",
  commit: "a".repeat(40),
  sha256,
};
async function api() {
  const result = await import("./evidence.ts").catch(() => null);
  assert.ok(result, "evidence implementation exists");
  return result;
}
test("local evidence is visibly local and validates exact line citations", async () => {
  const { localArtifact, validateCitation } = await api();
  const source = localArtifact(
    { id: "handbook", path: spec.path, sha256 },
    text,
  );
  assert.equal(source.source, "Local fixture");
  assert.equal(source.commit, null);
  validateCitation(
    {
      artifact_id: "handbook",
      start_line: 2,
      end_line: 2,
      quote: "Returns are accepted through day 30.",
    },
    [source],
  );
  assert.throws(() =>
    validateCitation(
      {
        artifact_id: "handbook",
        start_line: 1,
        end_line: 1,
        quote: "Returns are accepted through day 30.",
      },
      [source],
    ),
  );
  assert.throws(() =>
    localArtifact(
      { id: "handbook", path: spec.path, sha256: "0".repeat(64) },
      text,
    ),
  );
});
test("GitHub evidence pins real bytes and only matching fetched cache survives outage", async () => {
  const { createEvidenceReader } = await api();
  let unavailable = false;
  const reader = createEvidenceReader([spec], {
    fetch: async (url: string | URL | Request) => {
      assert.equal(
        String(url),
        `https://api.github.com/repos/YuvrajKashyap/legacydiff/contents/fixtures/returns/handbook.md?ref=${spec.commit}`,
      );
      if (unavailable) return new Response("", { status: 503 });
      return Response.json({
        type: "file",
        path: spec.path,
        encoding: "base64",
        size: Buffer.byteLength(text),
        sha,
        content: Buffer.from(text).toString("base64"),
      });
    },
  });
  const live = await reader.read("handbook");
  assert.equal(live.source, "Live");
  assert.equal(live.gitBlobSha, sha);
  assert.equal(live.sha256, sha256);
  assert.equal(live.commit, spec.commit);
  unavailable = true;
  const cached = await reader.read("handbook");
  assert.equal(cached.source, "Cached");
  assert.equal(cached.retrievedAt, live.retrievedAt);
  await assert.rejects(reader.read("https://evil.test"), /allowlist/);
});
test("GitHub mismatched bytes and branch aliases are rejected", async () => {
  const { createEvidenceReader } = await api();
  assert.throws(
    () => createEvidenceReader([{ ...spec, commit: "main" }]),
    /commit/,
  );
  const reader = createEvidenceReader([spec], {
    fetch: async () =>
      Response.json({
        type: "file",
        path: spec.path,
        encoding: "base64",
        size: 4,
        sha: "b".repeat(40),
        content: "ZXZpbA==",
      }),
  });
  await assert.rejects(reader.read("handbook"), /unavailable|hash/);
});
