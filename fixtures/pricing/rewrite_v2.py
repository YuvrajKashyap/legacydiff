"""Synthetic rewrite: reapplies volume discount even when the quote includes it."""

import json
import sys


def evaluate(value):
    subtotal = value["quantity"] * value["unit_price_cents"]
    apply_discount = value["quantity"] >= 100 and value["volume_discount_bps"] > 0
    discount = (
        (subtotal * value["volume_discount_bps"] + 5000) // 10000
        if apply_discount
        else 0
    )
    return {
        "currency": value["currency"],
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "total_cents": subtotal - discount,
        "discount_applied": apply_discount,
        "reason": "discount_applied" if apply_discount else "no_discount",
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
