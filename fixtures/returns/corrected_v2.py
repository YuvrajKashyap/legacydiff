"""Synthetic supplied corrected v2; not an AI repair."""

import json
import sys


def evaluate(value):
    if value["final_sale"]:
        reason = "final_sale"
    elif not value["has_receipt"]:
        reason = "missing_receipt"
    elif value["age_days"] > 30:
        reason = "outside_window"
    else:
        reason = "eligible"
    return {
        "eligible": reason == "eligible",
        "refund_cents": value["price_cents"] if reason == "eligible" else 0,
        "reason": reason,
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
