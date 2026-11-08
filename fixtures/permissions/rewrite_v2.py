"""Synthetic rewrite fixes explicit deny but retains the legacy tenant defect."""

import json
import sys


def evaluate(value):
    allowed = (
        value["authenticated"]
        and value["role_allow"]
        and not value["explicit_deny"]
        and value["action"] in {"read", "write", "delete"}
    )
    return {
        "allowed": allowed,
        "reason": "role_allow" if allowed else "default_deny",
        "protected_fields": ["record_id", "balance_cents"] if allowed else [],
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
