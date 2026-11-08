"""Fixed suite acceptance template; all reviewed expectations remain JSON data."""

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def checked_bundle():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["files"].items():
        if Path(name).name != name:
            raise ValueError("Invalid bundle filename")
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise ValueError("Bundle integrity failure: " + name)
    return manifest


def execute(filename, value):
    if filename not in {"baseline.py", "candidate.py"}:
        raise ValueError("Unknown reviewed fixture")
    process = subprocess.run(
        [sys.executable, "-I", "-B", str(ROOT / filename)],
        input=json.dumps(value).encode(),
        capture_output=True,
        timeout=3,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError("Reviewed fixture execution error")
    return json.loads(process.stdout)


class ApprovedScenario(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = checked_bundle()
        cls.cases = json.loads(
            (ROOT / "approved_cases.json").read_text(encoding="utf-8")
        )

    def test_candidate_against_reviewed_expectations(self):
        for case in self.cases:
            with self.subTest(case=case["id"]):
                actual = execute("candidate.py", case["input"])
                self.assertEqual(
                    json.dumps(actual, sort_keys=True),
                    json.dumps(case["expected"], sort_keys=True),
                )


if __name__ == "__main__":
    unittest.main()
