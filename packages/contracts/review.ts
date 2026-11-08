/**
 * Review rules called by the backend.
 * This file is shared for reuse, but the browser must not use it to decide whether an action is allowed.
 */
import type { ApprovedCase, Choice } from "./view-model";

/** Fixed reviewed scope; model suggestions cannot silently expand approval. */
export function approvedCases(choice: Choice): ApprovedCase[] {
  const inputs = [
    { age_days: 29, price_cents: 10000, has_receipt: true, final_sale: false },
    { age_days: 30, price_cents: 10000, has_receipt: true, final_sale: false },
    { age_days: 31, price_cents: 10000, has_receipt: true, final_sale: false },
    { age_days: 29, price_cents: 10000, has_receipt: false, final_sale: false },
    { age_days: 29, price_cents: 10000, has_receipt: true, final_sale: true },
  ];
  return inputs.map((input, index) => {
    const reason = input.final_sale
      ? "final_sale"
      : !input.has_receipt
        ? "missing_receipt"
        : input.age_days > (choice === "include" ? 30 : 29)
          ? "outside_window"
          : "eligible";
    const eligible = reason === "eligible";
    return {
      id: ["day-29", "day-30", "day-31", "no-receipt", "final-sale"][index],
      input,
      expected: { eligible, refund_cents: eligible ? 10000 : 0, reason },
    };
  });
}
export function assertApproval(
  role: string,
  revision: number,
  expectedRevision: number,
  version: number,
  expectedVersion: number,
): void {
  if (role !== "reviewer")
    throw new Error("Only an authorized reviewer may approve.");
  if (revision !== expectedRevision || version !== expectedVersion)
    throw new Error("This proposal changed. Review the latest revision.");
}
export function reconcileRequest(
  existing: string | undefined,
  payload: string,
): boolean {
  if (existing === undefined) return false;
  if (existing !== payload)
    throw new Error("Request ID already used with another payload.");
  return true;
}
