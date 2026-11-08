"""Synthetic legacy permissions defect: role allow bypasses deny and tenancy."""

import json
import sys


def evaluate(value):
    allowed = value["authenticated"] and value["role_allow"]
    return {
        "allowed": allowed,
        "reason": "role_allow" if allowed else "default_deny",
        "protected_fields": ["record_id", "balance_cents"] if allowed else [],
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
