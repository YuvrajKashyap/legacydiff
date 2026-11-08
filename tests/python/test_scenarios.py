"""Exercise reviewed scenario programs and exported checks without changing saved rooms."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backend.runner import core, suites
from backend.runner.suite_export import checked_snapshot, suite_export


class ScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = suites.suite_manifest()["scenarios"]
        cls.comparisons = {
            scenario["id"]: suites.suite_compare(scenario["id"])
            for scenario in cls.catalog
        }

    def test_four_real_corpora_and_shared_security_failure(self):
        for scenario in self.catalog:
            with self.subTest(scenario=scenario["id"]):
                result = self.comparisons[scenario["id"]]
                self.assertEqual(len(result["cases"]), 96)
                self.assertEqual(result["error_count"], 0)
                self.assertGreater(result["mismatch_count"], 0)
                self.assertTrue(
                    all(
                        case["baseline"]["status"] == "success"
                        for case in result["cases"]
                    )
                )
        permissions = self.comparisons["permissions"]
        matching = {
            case["id"] for case in permissions["cases"] if case["state"] == "match"
        }
        self.assertTrue(
            any(
                row["case_id"] in matching
                and row["baseline"] == row["candidate"] == "fail"
                for row in permissions["requirements"]
            )
        )

    def test_selected_returns_pair_is_clean_or_exactly_three_differences(self):
        clean = suites.suite_compare("returns", candidate="corrected-v2")
        different = self.comparisons["returns"]
        self.assertEqual(clean["mismatch_count"], 0)
        self.assertEqual(different["mismatch_count"], 3)
        self.assertEqual(len(clean["cases"]), 96)
        for baseline, candidate in [
            ("legacy-v1", "legacy-v1"),
            ("../outside", "rewrite-v2"),
        ]:
            with self.assertRaises(ValueError):
                suites.suite_compare("returns", baseline=baseline, candidate=candidate)

    def test_corrected_candidates_validate_and_export_standalone(self):
        for scenario in self.catalog:
            with (
                self.subTest(scenario=scenario["id"]),
                tempfile.TemporaryDirectory() as temp,
            ):
                identifier = scenario["id"]
                corrected = next(
                    item["id"]
                    for item in scenario["variants"]
                    if item["file"] == "corrected_v2.py"
                )
                policy = scenario["policies"][0]
                validation = suites.suite_validate(
                    identifier, policy["id"], policy["cases"], candidate=corrected
                )
                self.assertEqual(validation["state"], "pass")
                comparison = suites.suite_compare(identifier, candidate=corrected)
                snapshot = {
                    "decision": {
                        "version": 1,
                        "proposal_revision": 1,
                        "reviewer": "isolated-test",
                        "rationale": "Verify authored policy",
                        "policy": policy["id"],
                        "approved_at": "2026-11-08T00:00:00Z",
                    },
                    "cases": policy["cases"],
                    "evidence": scenario["evidence"],
                    "comparison": comparison,
                    "validation": validation,
                }
                folder = Path(temp) / "bundle"
                result = suite_export(identifier, snapshot, folder)
                self.assertTrue(Path(result["zip_path"]).is_file())
                manifest = json.loads((folder / "manifest.json").read_text())
                self.assertEqual(
                    manifest["source_hashes"]["candidate"], validation["candidateHash"]
                )
                self.assertEqual(
                    core.sha256((folder / "candidate.py").read_bytes()),
                    validation["candidateHash"],
                )
                self.assertEqual(
                    core.sha256((folder / "corpus.json").read_bytes()),
                    scenario["dataset"]["sha256"],
                )
                self.assertEqual(
                    set(manifest["files"]),
                    {p.name for p in folder.iterdir()} - {"manifest.json"},
                )
                for name, digest in manifest["files"].items():
                    self.assertEqual(core.sha256((folder / name).read_bytes()), digest)
                acceptance = subprocess.run(
                    [sys.executable, "-I", str(folder / "acceptance_tests.py")],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=40,
                )
                self.assertEqual(acceptance.returncode, 0, acceptance.stderr)
                requirements = subprocess.run(
                    [sys.executable, "-I", str(folder / "requirement_tests.py")],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=40,
                )
                expected_code = (
                    1 if identifier in {"accounts-payable", "permissions"} else 0
                )
                self.assertEqual(
                    requirements.returncode, expected_code, requirements.stderr
                )
                self.assertNotIn("ERROR:", requirements.stderr)
                if expected_code:
                    self.assertIn("FAIL:", requirements.stderr)
                # Exported checks must reject a modified source before executing it.
                with (folder / "candidate.py").open("a") as source:
                    source.write("\n# changed after export\n")
                tampered = subprocess.run(
                    [sys.executable, "-I", str(folder / "acceptance_tests.py")],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                self.assertNotEqual(tampered.returncode, 0)
                self.assertIn("Bundle integrity failure", tampered.stderr)
                forged = copy.deepcopy(snapshot)
                forged["validation"]["candidateHash"] = "0" * 64
                with self.assertRaises(ValueError):
                    checked_snapshot(identifier, forged)

    def test_policy_expectations_cannot_waive_permissions(self):
        scenario = next(item for item in self.catalog if item["id"] == "permissions")
        policy = scenario["policies"][0]
        self.assertTrue(policy["security_required"])
        cases = copy.deepcopy(policy["cases"])
        denied = next(case for case in cases if not case["expected"]["allowed"])
        denied["expected"]["allowed"] = True
        with self.assertRaises(ValueError):
            suites.suite_validate("permissions", policy["id"], cases)


if __name__ == "__main__":
    unittest.main()
