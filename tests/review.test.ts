import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvedCases,
  assertApproval,
  reconcileRequest,
} from "../packages/contracts/review.ts";

test("inclusive and exclusive approval change day 30 only and retain controls", () => {
  const include = approvedCases("include");
  const exclude = approvedCases("exclude");
  assert.deepEqual(
    include.map((c) => c.expected.eligible),
    [true, true, false, false, false],
  );
  assert.deepEqual(
    exclude.map((c) => c.expected.eligible),
    [true, false, false, false, false],
  );
  assert.equal(include[1].expected.refund_cents, 10000);
});
test("stale proposal or decision and nonreviewers cannot approve", () => {
  assert.throws(() => assertApproval("engineer", 2, 2, 0, 0));
  assert.throws(() => assertApproval("reviewer", 2, 1, 0, 0));
  assert.throws(() => assertApproval("reviewer", 2, 2, 1, 0));
  assert.doesNotThrow(() => assertApproval("reviewer", 2, 2, 1, 1));
});
test("request replay is accepted only for identical operation payload", () => {
  assert.equal(reconcileRequest("payload", "payload"), true);
  assert.equal(reconcileRequest(undefined, "payload"), false);
  assert.throws(() => reconcileRequest("first", "changed"));
});
