"""Supplied pricing correction; not an AI repair."""

import json
import sys


def evaluate(value):
    subtotal = value["quantity"] * value["unit_price_cents"]
    qualifies = value["quantity"] >= 100 and value["volume_discount_bps"] > 0
    apply_discount = qualifies and not value["price_includes_discount"]
    discount = (
        (subtotal * value["volume_discount_bps"] + 5000) // 10000
        if apply_discount
        else 0
    )
    if apply_discount:
        reason = "discount_applied"
    elif qualifies and value["price_includes_discount"]:
        reason = "already_discounted"
    else:
        reason = "no_discount"
    return {
        "currency": value["currency"],
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "total_cents": subtotal - discount,
        "discount_applied": apply_discount,
        "reason": reason,
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(sys.stdin))))
