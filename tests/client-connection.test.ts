import test from "node:test";
import assert from "node:assert/strict";
import type { Catalog } from "../packages/contracts/view-model.ts";

test("wire conversions preserve field values and round-trip the catalog", async () => {
  const wire = await import("../packages/contracts/wire.ts").catch(() => null);
  assert.ok(wire, "wire conversion implementation exists");
  const catalog: Catalog = {
    variants: [
      {
        id: "legacy-v1",
        file: "legacy_v1.py",
        entry_point: "evaluate",
        revision: "v1",
        sha256: "a".repeat(64),
        source: "synthetic",
      },
    ],
    evidence: [],
    models: [],
    runnerMode: "local",
    expectedCases: {
      include: [
        {
          id: "day-30",
          input: {
            age_days: 30,
            price_cents: 10000,
            has_receipt: true,
            final_sale: false,
          },
          expected: { eligible: true, refund_cents: 10000, reason: "eligible" },
        },
      ],
      exclude: [],
    },
  };
  const result = wire.catalogToWire(catalog);
  assert.equal(result.variants[0]!.entryPoint, "evaluate");
  assert.equal(result.expectedCases.include[0]!.input.ageDays, 30);
  assert.equal(result.expectedCases.include[0]!.expected.refundCents, 10000);
  assert.deepEqual(wire.catalogFromWire(result), catalog);
});

test("client rejects mutations before the authorized subscription is applied", async () => {
  const module = await import("../packages/client/connection.ts").catch(
    () => null,
  );
  assert.ok(module, "client connection implementation exists");
  const client = module.createLegacyDiffClient({
    storage: { getItem: () => null, setItem: () => undefined },
  });
  assert.equal(client.getSnapshot().ready, false);
  await assert.rejects(
    client.getSnapshot().actions.addComment({
      roomId: "room",
      runId: "run",
      text: "Review",
      requestId: "request",
    }),
    /snapshot|connect/i,
  );
  client.disconnect();
});
