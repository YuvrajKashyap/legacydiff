import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

async function schemas() {
  const result = await import("../../packages/contracts/validation.ts").catch(
    () => null,
  );
  assert.ok(result, "runner boundary schemas exist");
  return result;
}
function runner(request: unknown): unknown {
  const result = spawnSync("python", ["-m", "backend.runner.cli"], {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const input = {
  age_days: 30,
  price_cents: 10000,
  has_receipt: true,
  final_sale: false,
};
test("strict runner schemas accept real manifest and measured comparison", async () => {
  const api = await schemas();
  api.runnerManifestSchema.parse(runner({ op: "manifest" }));
  const comparison = api.comparisonSchema.parse(
    runner({ op: "compare", baseline: "legacy-v1", candidate: "rewrite-v2" }),
  );
  assert.equal(comparison.mismatch_count, 1);
  assert.throws(() =>
    api.comparisonSchema.parse({ ...comparison, mismatch_count: 0 }),
  );
  const changed = structuredClone(comparison);
  changed.cases[0]!.baseline.case_id = "wrong-case";
  assert.throws(() => api.comparisonSchema.parse(changed));
});
test("input/output schemas reject coercion, unknown fields and inconsistent business fields", async () => {
  const api = await schemas();
  for (const value of [
    { ...input, age_days: true },
    { ...input, price_cents: 1.1 },
    { ...input, age_days: 366 },
    { ...input, price_cents: Infinity },
    { ...input, command: "execute" },
  ]) {
    assert.equal(api.returnInputSchema.safeParse(value).success, false);
  }
  assert.equal(
    api.returnOutputSchema.safeParse({
      eligible: false,
      refund_cents: 100,
      reason: "outside_window",
    }).success,
    false,
  );
  assert.equal(
    api.returnOutputSchema.safeParse({
      eligible: true,
      refund_cents: 100,
      reason: "outside_window",
    }).success,
    false,
  );
});
test("validation schema accepts actual failure and rejects fabricated pass", async () => {
  const api = await schemas();
  const result = api.validationResultSchema.parse(
    runner({
      op: "validate",
      variant: "rewrite-v2",
      approved_cases: [
        {
          id: "day-30",
          input,
          expected: { eligible: true, refund_cents: 10000, reason: "eligible" },
        },
      ],
    }),
  );
  assert.equal(result.state, "fail");
  assert.throws(() =>
    api.validationResultSchema.parse({ ...result, state: "pass" }),
  );
  assert.throws(() =>
    api.validationResultSchema.parse({ ...result, extra: "unknown" }),
  );
});
