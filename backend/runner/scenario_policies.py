"""Authored policy oracles and independent requirements, separate from variants.

These are proposed expectations, not observed execution results. Security and
approver controls are mandatory even when a business interpretation is selected.
"""

from .scenario_contracts import validate_input
from .suite_requirements import ELIGIBLE_APPROVERS, permission_allowed

POLICIES = {
    "returns": {"include", "exclude"},
    "pricing": {"no-stacking", "stack-discount"},
    "accounts-payable": {"gross-threshold", "net-threshold"},
    "permissions": {"deny-overrides"},
}


def policy_id(scenario, policy):
    if type(policy) is not str or policy not in POLICIES.get(scenario, set()):
        raise ValueError("Unknown or prohibited policy choice")
    return policy


def expected_output(scenario, policy, value):
    validate_input(scenario, value)
    policy_id(scenario, policy)
    if scenario == "returns":
        if value["final_sale"]:
            reason = "final_sale"
        elif not value["has_receipt"]:
            reason = "missing_receipt"
        elif value["age_days"] >= (31 if policy == "include" else 30):
            reason = "outside_window"
        else:
            reason = "eligible"
        eligible = reason == "eligible"
        return {
            "eligible": eligible,
            "refund_cents": value["price_cents"] if eligible else 0,
            "reason": reason,
        }
    if scenario == "pricing":
        subtotal = value["quantity"] * value["unit_price_cents"]
        qualifies = value["quantity"] >= 100 and value["volume_discount_bps"] > 0
        apply = qualifies and (
            policy == "stack-discount" or not value["price_includes_discount"]
        )
        discount = (
            (subtotal * value["volume_discount_bps"] + 5000) // 10000 if apply else 0
        )
        reason = "no_discount"
        if apply:
            reason = "discount_applied"
        elif qualifies and value["price_includes_discount"]:
            reason = "already_discounted"
        return {
            "currency": value["currency"],
            "subtotal_cents": subtotal,
            "discount_cents": discount,
            "total_cents": subtotal - discount,
            "discount_applied": apply,
            "reason": reason,
        }
    if scenario == "accounts-payable":
        basis = value["subtotal_cents"] + (
            value["tax_cents"] if policy == "gross-threshold" else 0
        )
        required = 2 if basis >= 1000000 else 1
        selected = {value["approver_one"], value["approver_two"]}
        approvers = sorted((selected & ELIGIBLE_APPROVERS) - {value["submitter"]})
        ready = len(approvers) >= required
        return {
            "routing": "enhanced" if required == 2 else "standard",
            "basis_cents": basis,
            "required_approvals": required,
            "eligible_approvers": approvers,
            "ready": ready,
            "reason": "ready" if ready else "insufficient_approvers",
        }
    allowed = permission_allowed(value)
    return {
        "allowed": allowed,
        "reason": "role_allow" if allowed else "default_deny",
        "protected_fields": ["record_id", "balance_cents"] if allowed else [],
    }
