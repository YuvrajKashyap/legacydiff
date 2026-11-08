"""Fixed reviewed test template. Expectations remain JSON, never executable text."""

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class ApprovedReturns(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        for name, expected in manifest["files"].items():
            if Path(name).name != name:
                raise ValueError("Invalid bundle filename")
            if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
                raise ValueError("Bundle integrity failure: " + name)
        cls.cases = json.loads(
            (ROOT / "approved_cases.json").read_text(encoding="utf-8")
        )

    def test_approved_expectations(self):
        for case in self.cases:
            with self.subTest(case=case["id"]):
                result = subprocess.run(
                    [sys.executable, "-I", "-B", str(ROOT / "candidate.py")],
                    input=json.dumps(case["input"]).encode(),
                    check=False,
                    capture_output=True,
                    timeout=3,
                )
                if result.returncode != 0:
                    raise RuntimeError("Fixture execution error")
                actual = json.loads(result.stdout)
                self.assertEqual(
                    json.dumps(actual, sort_keys=True),
                    json.dumps(case["expected"], sort_keys=True),
                )


if __name__ == "__main__":
    unittest.main()
