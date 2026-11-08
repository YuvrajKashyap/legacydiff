import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from services.runner import core, export

APPROVED = [
    {
        "id": "day-29",
        "input": {
            "age_days": 29,
            "price_cents": 10000,
            "has_receipt": True,
            "final_sale": False,
        },
        "expected": {"eligible": True, "refund_cents": 10000, "reason": "eligible"},
    },
    {
        "id": "day-30",
        "input": {
            "age_days": 30,
            "price_cents": 10000,
            "has_receipt": True,
            "final_sale": False,
        },
        "expected": {"eligible": True, "refund_cents": 10000, "reason": "eligible"},
    },
    {
        "id": "day-31",
        "input": {
            "age_days": 31,
            "price_cents": 10000,
            "has_receipt": True,
            "final_sale": False,
        },
        "expected": {"eligible": False, "refund_cents": 0, "reason": "outside_window"},
    },
    {
        "id": "no-receipt",
        "input": {
            "age_days": 30,
            "price_cents": 10000,
            "has_receipt": False,
            "final_sale": False,
        },
        "expected": {"eligible": False, "refund_cents": 0, "reason": "missing_receipt"},
    },
    {
        "id": "final-sale",
        "input": {
            "age_days": 30,
            "price_cents": 10000,
            "has_receipt": True,
            "final_sale": True,
        },
        "expected": {"eligible": False, "refund_cents": 0, "reason": "final_sale"},
    },
]


class RunnerControls(unittest.TestCase):
    def test_hash_mismatch_prevents_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            copied = Path(temp) / "returns"
            shutil.copytree(core.FIXTURES, copied)
            (copied / "rewrite_v2.py").write_text('raise RuntimeError("tampered")')
            with (
                patch.object(core, "FIXTURES", copied),
                self.assertRaisesRegex(ValueError, "hash mismatch"),
            ):
                core.execute("rewrite-v2", core.initial_cases()[0])

    def test_unknown_or_identical_pair_denied(self):
        for pair in [("legacy-v1", "legacy-v1"), ("../../anything", "rewrite-v2")]:
            with self.assertRaises(ValueError):
                core.compare(*pair)

    def test_timeout_crash_output_limit_and_cancellation_clean_up(self):
        commands = [
            ("import time; time.sleep(10)", 0.05, None, "timeout"),
            ('raise RuntimeError("secret diagnostic")', 3, None, "error"),
            ('import sys; sys.stdout.write("x"*1000000)', 3, None, "error"),
        ]
        cancelled = threading.Event()
        cancelled.set()
        commands.append(("import time; time.sleep(10)", 3, cancelled, "cancelled"))
        for source, timeout, cancel, expected in commands:
            with self.subTest(expected=expected):
                result = core._bounded_process(
                    [sys.executable, "-I", "-c", source], b"", timeout, 1024, cancel
                )
                self.assertEqual(result["status"], expected)
                self.assertLessEqual(len(result["stdout"]), 1024)
                self.assertNotIn("secret", result["diagnostic"])

    def test_output_schema_and_nonfinite_input_rejected(self):
        for output in [
            {"eligible": 1, "refund_cents": 0, "reason": "eligible"},
            {"eligible": False, "refund_cents": 1, "reason": "final_sale"},
            {"eligible": True, "refund_cents": 1, "reason": "invented"},
        ]:
            with self.assertRaises(ValueError):
                core.validate_output(output)
        with self.assertRaises(ValueError):
            core.validate_input({**APPROVED[0]["input"], "price_cents": float("nan")})

    def test_two_crashes_are_errors_and_not_a_match(self):
        with tempfile.TemporaryDirectory() as temp:
            copied = Path(temp) / "returns"
            shutil.copytree(core.FIXTURES, copied)
            config = json.loads((copied / "manifest.json").read_text())
            for variant in config["variants"]:
                artifact = copied / variant["file"]
                artifact.write_text('raise RuntimeError("test crash")')
                variant["sha256"] = core.sha256(artifact.read_bytes())
            (copied / "manifest.json").write_text(json.dumps(config))
            with patch.object(core, "FIXTURES", copied):
                result = core.compare(
                    "legacy-v1", "rewrite-v2", [core.initial_cases()[0]]
                )
            self.assertEqual(result["error_count"], 1)
            self.assertEqual(result["mismatch_count"], 0)
            self.assertEqual(result["cases"][0]["state"], "error")


class AcceptanceTests(unittest.TestCase):
    def test_include_fails_original_and_passes_supplied_correction(self):
        failed = export.validate("rewrite-v2", APPROVED)
        passed = export.validate("corrected-v2", APPROVED)
        self.assertIsInstance(failed, dict)
        self.assertIsInstance(passed, dict)
        self.assertEqual(failed["state"], "fail")
        self.assertEqual(passed["state"], "pass")
        self.assertEqual(
            failed["cases"][1]["actual"],
            {"eligible": False, "refund_cents": 0, "reason": "outside_window"},
        )

    def test_exclude_passes_original_and_fails_legacy(self):
        approved = json.loads(json.dumps(APPROVED))
        approved[1]["expected"] = {
            "eligible": False,
            "refund_cents": 0,
            "reason": "outside_window",
        }
        self.assertIsInstance(export.validate("rewrite-v2", approved), dict)
        self.assertEqual(export.validate("rewrite-v2", approved)["state"], "pass")
        self.assertEqual(export.validate("legacy-v1", approved)["state"], "fail")

    def test_export_requires_approval_and_runs_standalone(self):
        decision = {
            "version": 1,
            "proposal_revision": 1,
            "reviewer": "test-reviewer",
            "rationale": "Approved inclusive interpretation",
            "choice": "include",
            "approved_at": "2026-11-08T08:00:00Z",
        }
        snapshot = {
            "decision": decision,
            "approved_cases": APPROVED,
            "candidate": "rewrite-v2",
            "evidence": core.manifest()["evidence"],
            "run_results": core.compare("legacy-v1", "rewrite-v2"),
        }
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                export.create_bundle(
                    {**snapshot, "decision": None}, Path(temp) / "invalid"
                )
            result = export.create_bundle(snapshot, Path(temp) / "review")
            self.assertIsInstance(result, dict)
            bundle = Path(result["directory"])
            run = subprocess.run(
                [sys.executable, "-I", "acceptance_tests.py"],
                cwd=bundle,
                check=False,
                capture_output=True,
                timeout=10,
            )
            self.assertEqual(run.returncode, 1)
            self.assertIn(b"FAILED (failures=1)", run.stderr)
            for filename in [
                "decision.json",
                "evidence.json",
                "run_results.json",
                "approved_cases.json",
                "manifest.json",
                "README.md",
            ]:
                self.assertTrue((bundle / filename).is_file())
            self.assertTrue(Path(result["zip_path"]).is_file())


if __name__ == "__main__":
    unittest.main()
