"""Synthetic AP legacy: net threshold and a missing submitter exclusion."""

import json
import sys

ELIGIBLE = {"manager-a", "manager-b", "finance-a", "finance-b"}


def evaluate(value):
    basis = value["subtotal_cents"]
    required = 2 if basis >= 1000000 else 1
    approvers = sorted(
        {
            person
            for person in [value["approver_one"], value["approver_two"]]
            if person in ELIGIBLE
        }
    )
    ready = len(approvers) >= required
    return {
        "routing": "enhanced" if required == 2 else "standard",
        "basis_cents": basis,
        "required_approvals": required,
        "eligible_approvers": approvers,
        "ready": ready,
        "reason": "ready" if ready else "insufficient_approvers",
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
