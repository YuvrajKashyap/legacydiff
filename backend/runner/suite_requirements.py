"""Independent synthetic requirements used by runtime and exported review bundles."""

ELIGIBLE_APPROVERS = {"manager-a", "manager-b", "finance-a", "finance-b"}

REQUIREMENTS = {
    "returns": [
        (
            "receipt-and-final-sale",
            "Missing receipt or final sale always prevents eligibility.",
        ),
        (
            "refund-cents",
            "Eligible refunds equal input price; ineligible refunds are zero.",
        ),
    ],
    "pricing": [
        ("preserve-currency", "Preserve the requested synthetic currency."),
        (
            "money-conservation",
            "Subtotal is quantity times unit price; discount plus total equals subtotal.",
        ),
        (
            "exact-rounding",
            "Applied discounts use integer half-up rounding; unapplied discounts are zero.",
        ),
        (
            "volume-threshold",
            "No volume discount applies below 100 units or with a zero rate.",
        ),
    ],
    "accounts-payable": [
        (
            "distinct-eligible-approvers",
            "Count only distinct selected manager/finance approvers.",
        ),
        (
            "submitter-exclusion",
            "The invoice submitter must never count as an approver.",
        ),
        (
            "approval-readiness",
            "Readiness requires enough distinct eligible, non-submitter approvers.",
        ),
    ],
    "permissions": [
        ("explicit-deny", "An explicit deny always overrides a role allow."),
        (
            "default-deny",
            "Unauthenticated subjects, missing grants, and unknown actions default to deny.",
        ),
        ("tenant-isolation", "A subject must never access another tenant's resource."),
        (
            "denied-data",
            "A request denied by mandatory policy exposes no protected fields, even if the implementation incorrectly allows it.",
        ),
    ],
}


def permission_allowed(value):
    return all(
        [
            value["authenticated"],
            value["role_allow"],
            not value["explicit_deny"],
            value["subject_tenant"] == value["resource_tenant"],
            value["action"] != "unknown",
        ]
    )


def requirement_verdicts(scenario, value, output):
    if scenario == "returns":
        return {
            "receipt-and-final-sale": not (
                value["final_sale"] or not value["has_receipt"]
            )
            or not output["eligible"],
            "refund-cents": output["refund_cents"]
            == (value["price_cents"] if output["eligible"] else 0),
        }
    if scenario == "pricing":
        subtotal = value["quantity"] * value["unit_price_cents"]
        discount = (
            (subtotal * value["volume_discount_bps"] + 5000) // 10000
            if output["discount_applied"]
            else 0
        )
        return {
            "preserve-currency": output["currency"] == value["currency"],
            "money-conservation": output["subtotal_cents"] == subtotal
            and output["total_cents"] + output["discount_cents"] == subtotal,
            "exact-rounding": output["discount_cents"] == discount,
            "volume-threshold": (
                value["quantity"] >= 100 and value["volume_discount_bps"] > 0
            )
            or not output["discount_applied"],
        }
    if scenario == "accounts-payable":
        approvers = output["eligible_approvers"]
        selected = {value["approver_one"], value["approver_two"]}
        valid = (selected & ELIGIBLE_APPROVERS) - {value["submitter"]}
        return {
            "distinct-eligible-approvers": len(approvers) == len(set(approvers))
            and set(approvers) <= selected & ELIGIBLE_APPROVERS,
            "submitter-exclusion": value["submitter"] not in approvers,
            "approval-readiness": output["ready"]
            == (len(set(approvers) & valid) >= output["required_approvals"]),
        }
    return {
        "explicit-deny": not value["explicit_deny"] or not output["allowed"],
        "default-deny": (
            value["authenticated"]
            and value["role_allow"]
            and value["action"] != "unknown"
        )
        or not output["allowed"],
        "tenant-isolation": value["subject_tenant"] == value["resource_tenant"]
        or not output["allowed"],
        "denied-data": permission_allowed(value) or output["protected_fields"] == [],
    }
