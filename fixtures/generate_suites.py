"""Generate deterministic INPUT corpora and hashes, never execute fixture variants.

Authored policy expectations are expanded separately by the runner's policy module.
This generator never creates measured outputs or verification claims.
"""

import hashlib
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SCENARIOS = {
    "returns": {
        "title": "Returns window",
        "description": "Inclusive versus exclusive day-30 returns with receipt and final-sale controls.",
        "decision_owner": "Returns policy owner",
        "policies": [
            {
                "id": "include",
                "label": "Include day 30",
                "description": "Accept returns through day 30.",
                "security_required": False,
            },
            {
                "id": "exclude",
                "label": "Exclude day 30",
                "description": "Accept returns strictly before day 30.",
                "security_required": False,
            },
        ],
        "evidence": [
            ("operations-handbook", "Operations handbook", "operations_handbook.md"),
            ("migration-ticket", "Migration ticket", "migration_ticket.md"),
        ],
    },
    "pricing": {
        "title": "Volume pricing",
        "description": "An already-discounted quote can receive an unintended second volume discount.",
        "decision_owner": "Pricing owner",
        "policies": [
            {
                "id": "no-stacking",
                "label": "Honor the included discount",
                "description": "Do not apply another volume discount when the quoted price includes it.",
                "security_required": False,
            },
            {
                "id": "stack-discount",
                "label": "Apply the additional discount",
                "description": "Apply the volume discount at quantity 100 or greater even to an already-discounted quote.",
                "security_required": False,
            },
        ],
        "evidence": [
            ("pricing-agreement", "Pricing agreement", "pricing_agreement.md"),
            ("pricing-migration", "Pricing migration ticket", "migration_ticket.md"),
        ],
    },
    "accounts-payable": {
        "title": "Invoice approval routing",
        "description": "Net versus gross approval thresholds, distinct eligible approvers, and submitter exclusion.",
        "decision_owner": "Finance control owner",
        "policies": [
            {
                "id": "gross-threshold",
                "label": "Route on gross amount",
                "description": "Subtotal plus tax at or above 1,000,000 cents requires two eligible approvals.",
                "security_required": False,
            },
            {
                "id": "net-threshold",
                "label": "Route on net amount",
                "description": "Subtotal at or above 1,000,000 cents requires two eligible approvals; approver controls still apply.",
                "security_required": False,
            },
        ],
        "evidence": [
            ("ap-controls", "Finance controls manual", "controls_manual.md"),
            ("ap-migration", "Invoice migration ticket", "migration_ticket.md"),
        ],
    },
    "permissions": {
        "title": "Permission precedence and tenant isolation",
        "description": "A deny-overrides rewrite can still share the legacy cross-tenant access defect.",
        "decision_owner": "Security owner",
        "policies": [
            {
                "id": "deny-overrides",
                "label": "Enforce mandatory access controls",
                "description": "Explicit deny, default deny, tenant isolation, and denied-response data suppression are non-waivable.",
                "security_required": True,
            },
        ],
        "evidence": [
            ("permissions-policy", "Approved access policy", "access_policy.md"),
            (
                "permissions-migration",
                "Permission migration ticket",
                "migration_ticket.md",
            ),
        ],
    },
}

DOCUMENTS = {
    "pricing/pricing_agreement.md": "# Synthetic pricing agreement\n\nA quoted unit price marked as including a volume discount must not receive that discount twice.\nVolume discounts begin at quantity 100. Round discount cents half up; preserve the quoted currency.\n",
    "pricing/migration_ticket.md": "# Synthetic pricing migration ticket\n\nApply the configured volume discount to every qualifying order of at least 100 units.\nThe migration wording does not exempt quotes already marked as discounted; the pricing owner must resolve that difference.\n",
    "accounts-payable/controls_manual.md": "# Synthetic finance controls manual\n\nInvoices with subtotal plus tax at or above 1,000,000 cents require two distinct eligible approvers.\nAn approver must be a manager or finance reviewer and cannot be the invoice submitter.\n",
    "accounts-payable/migration_ticket.md": "# Synthetic invoice routing specification\n\nRetain the legacy subtotal-only threshold of 1,000,000 cents for enhanced routing.\nThe finance control owner must resolve net versus gross basis; approver eligibility and submitter exclusion cannot be waived.\n",
    "permissions/access_policy.md": "# Synthetic approved access policy\n\nAn explicit user deny overrides every role allow. Unknown actions and unauthenticated or ungranted access default to deny.\nAccess never crosses tenant boundaries. A response denied by these requirements must contain no protected fields. These controls are mandatory, not a parity choice.\n",
    "permissions/migration_ticket.md": "# Synthetic permission rewrite ticket\n\nAdd explicit deny precedence and reject unknown actions. Preserve the existing role lookup for other requests.\nThis ticket does not waive tenant isolation; matching legacy and rewrite outputs may still share a security defect.\n",
    "returns/requirements.md": "# Independent synthetic returns requirements\n\nFinal-sale items and missing-receipt requests are ineligible under either window interpretation.\nAn eligible refund equals the input price in integer cents; an ineligible refund is zero.\n",
    "pricing/requirements.md": "# Independent synthetic pricing requirements\n\nPreserve currency and nonnegative integer cents. Subtotal equals quantity times unit price. Total plus discount equals subtotal.\nIf a discount applies, round subtotal times basis points half up using integer arithmetic. No volume discount applies below quantity 100.\n",
    "accounts-payable/requirements.md": "# Independent synthetic approval requirements\n\nCount each eligible approver at most once. Employees without manager or finance authority are not eligible. Never count the submitter.\nReadiness requires enough distinct eligible approvers for the selected routing basis. These controls apply under both net and gross policy choices.\n",
    "permissions/requirements.md": "# Independent synthetic security requirements\n\nExplicit deny always denies. Missing grants, unauthenticated subjects, and unknown actions default to deny. Tenant mismatch always denies.\nWhenever mandatory policy denies, protected_fields must be empty even if the implementation incorrectly reports allowed. Requirements apply independently to both implementations and cannot be approved away.\n",
}


def corpus(scenario):
    values = []
    if scenario == "returns":
        for age, price, receipt, final in itertools.product(
            [0, 1, 29, 30, 31, 60, 364, 365],
            [0, 10000, 1000000],
            [False, True],
            [False, True],
        ):
            category = (
                "window-boundary" if age in [29, 30, 31] else "range-and-controls"
            )
            values.append(
                (
                    category,
                    {
                        "age_days": age,
                        "price_cents": price,
                        "has_receipt": receipt,
                        "final_sale": final,
                    },
                )
            )
    elif scenario == "pricing":
        for quantity, price, included, currency in itertools.product(
            [0, 1, 99, 100, 101, 120, 999, 1000],
            [1, 9000, 1000000],
            [False, True],
            ["USD", "EUR"],
        ):
            rate = 0 if quantity == 0 else {1: 1, 9000: 1000, 1000000: 5000}[price]
            category = (
                "discount-threshold"
                if quantity in [99, 100, 101]
                else "rounding-currency-and-bounds"
            )
            values.append(
                (
                    category,
                    {
                        "quantity": quantity,
                        "unit_price_cents": price,
                        "volume_discount_bps": rate,
                        "price_includes_discount": included,
                        "currency": currency,
                    },
                )
            )
    elif scenario == "accounts-payable":
        amounts = [
            (0, 0),
            (999999, 0),
            (1000000, 0),
            (1000001, 0),
            (980000, 98000),
            (900000, 99999),
            (900000, 100000),
            (10000000, 2000000),
        ]
        people = [
            ("manager-a", "finance-a"),
            ("manager-a", "manager-a"),
            ("employee-a", "finance-a"),
            ("employee-a", "employee-b"),
            ("manager-b", "finance-b"),
            ("finance-a", "finance-a"),
        ]
        for (subtotal, tax), submitter, (first, second) in itertools.product(
            amounts, ["employee-a", "manager-a"], people
        ):
            category = (
                "net-gross-boundary"
                if subtotal < 1000000 <= subtotal + tax
                else "approver-controls"
            )
            values.append(
                (
                    category,
                    {
                        "subtotal_cents": subtotal,
                        "tax_cents": tax,
                        "submitter": submitter,
                        "approver_one": first,
                        "approver_two": second,
                    },
                )
            )
    else:
        tenants = [("acme", "acme"), ("globex", "globex"), ("acme", "globex")]
        for authenticated, role_allow, explicit_deny, (
            subject,
            resource,
        ), action in itertools.product(
            [False, True],
            [False, True],
            [False, True],
            tenants,
            ["read", "write", "delete", "unknown"],
        ):
            category = (
                "tenant-isolation"
                if subject != resource
                else "deny-precedence-and-defaults"
            )
            values.append(
                (
                    category,
                    {
                        "authenticated": authenticated,
                        "role_allow": role_allow,
                        "explicit_deny": explicit_deny,
                        "subject_tenant": subject,
                        "resource_tenant": resource,
                        "action": action,
                    },
                )
            )
    return [
        {"id": f"{scenario}-{index + 1:03d}", "category": category, "input": value}
        for index, (category, value) in enumerate(values)
    ]


def write_inputs_and_metadata():
    for relative, text in DOCUMENTS.items():
        (ROOT / relative).write_text(text, encoding="utf-8", newline="\n")
    for scenario, metadata in SCENARIOS.items():
        directory = ROOT / scenario
        cases = corpus(scenario)
        corpus_path = directory / "corpus.json"
        corpus_path.write_text(
            json.dumps(cases, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
        prefix = "" if scenario == "returns" else scenario + "-"
        variants = []
        for suffix, filename in [
            ("legacy-v1", "legacy_v1.py"),
            ("rewrite-v2", "rewrite_v2.py"),
            ("corrected-v2", "corrected_v2.py"),
        ]:
            variants.append(
                {
                    "id": prefix + suffix,
                    "file": filename,
                    "sha256": hashlib.sha256(
                        (directory / filename).read_bytes()
                    ).hexdigest(),
                }
            )
        evidence = []
        records = metadata["evidence"] + [
            (scenario + "-requirements", "Independent requirements", "requirements.md")
        ]
        for artifact_id, title, filename in records:
            data = (directory / filename).read_bytes()
            evidence.append(
                {
                    "id": artifact_id,
                    "title": title,
                    "file": filename,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "line_start": 3,
                    "line_end": len(data.decode().splitlines()),
                }
            )
        definition = {
            **metadata,
            "id": scenario,
            "baseline": prefix + "legacy-v1",
            "candidate": prefix + "rewrite-v2",
            "variants": variants,
            "evidence": evidence,
            "dataset": {
                "file": "corpus.json",
                "version": "1",
                "sha256": hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
                "count": len(cases),
                "categories": sorted({case["category"] for case in cases}),
            },
        }
        (directory / "suite.json").write_text(
            json.dumps(definition, indent=2) + "\n", encoding="utf-8", newline="\n"
        )


if __name__ == "__main__":
    write_inputs_and_metadata()
