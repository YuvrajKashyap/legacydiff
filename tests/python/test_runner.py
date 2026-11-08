import unittest

from backend.runner import core


class ContractTests(unittest.TestCase):
    def test_rejects_bool_money_unknown_fields_and_invalid_bounds(self):
        valid = {
            "age_days": 30,
            "price_cents": 10000,
            "has_receipt": True,
            "final_sale": False,
        }
        self.assertEqual(core.validate_input(valid), valid)
        for key, value in [
            ("age_days", True),
            ("age_days", -1),
            ("age_days", 366),
            ("price_cents", 1.0),
            ("price_cents", True),
            ("price_cents", 1000001),
            ("has_receipt", 1),
            ("final_sale", None),
            ("unknown", 1),
        ]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                core.validate_input({**valid, key: value})

    def test_typed_comparison_distinguishes_missing_null_bool_and_array_order(self):
        self.assertEqual(core.differences({"x": 1, "y": 2}, {"y": 2, "x": 1}), [])
        self.assertEqual(core.differences({"x": True}, {"x": 1}), ["x"])
        self.assertEqual(core.differences({}, {"x": None}), ["x"])
        self.assertEqual(core.differences({"x": [1, 2]}, {"x": [2, 1]}), ["x"])

    def test_real_day_thirty_execution_reports_exact_differences(self):
        result = core.compare("legacy-v1", "rewrite-v2")
        self.assertIsInstance(result, dict)
        case = next(c for c in result["cases"] if c["id"] == "day-30")
        self.assertEqual(
            case["baseline"]["output"],
            {"eligible": True, "refund_cents": 10000, "reason": "eligible"},
        )
        self.assertEqual(
            case["candidate"]["output"],
            {"eligible": False, "refund_cents": 0, "reason": "outside_window"},
        )
        self.assertEqual(case["differences"], ["eligible", "reason", "refund_cents"])
        self.assertEqual(result["mismatch_count"], 1)


if __name__ == "__main__":
    unittest.main()
