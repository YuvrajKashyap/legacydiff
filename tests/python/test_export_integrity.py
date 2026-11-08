import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from test_acceptance import APPROVED

from services.runner import core, export


def approval_snapshot():
    return {
        "decision": {
            "version": 1,
            "proposal_revision": 1,
            "reviewer": "test-reviewer",
            "rationale": "Approved inclusive interpretation",
            "choice": "include",
            "approved_at": "2026-11-08T08:00:00Z",
        },
        "approved_cases": APPROVED,
        "candidate": "corrected-v2",
        "evidence": core.manifest()["evidence"],
        "run_results": core.compare("legacy-v1", "corrected-v2"),
    }


class ExportIntegrityTests(unittest.TestCase):
    def test_every_exported_file_is_hashed_and_each_tamper_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            result = export.create_bundle(approval_snapshot(), Path(temp) / "bundle")
            directory = Path(result["directory"])
            manifest = json.loads((directory / "manifest.json").read_text())
            actual_files = {path.name for path in directory.iterdir()}
            self.assertEqual(set(manifest["files"]), actual_files - {"manifest.json"})

            for name, digest in manifest["files"].items():
                with self.subTest(file=name):
                    path = directory / name
                    original = path.read_bytes()
                    self.assertEqual(hashlib.sha256(original).hexdigest(), digest)
                    path.write_bytes(original + b"\n# tampered\n")
                    process = subprocess.run(
                        [sys.executable, "-I", "acceptance_tests.py"],
                        cwd=directory,
                        check=False,
                        capture_output=True,
                        timeout=10,
                    )
                    self.assertEqual(process.returncode, 1)
                    self.assertIn(b"Bundle integrity failure", process.stderr)
                    path.write_bytes(original)

            process = subprocess.run(
                [sys.executable, "-I", "acceptance_tests.py"],
                cwd=directory,
                check=False,
                capture_output=True,
                timeout=10,
            )
            self.assertEqual(process.returncode, 0)

    def test_environment_secrets_do_not_reach_fixture_or_zip(self):
        sentinel = "test-only-secret-boundary-sentinel-3bd48f"
        with patch.dict(os.environ, {"NVIDIA_API_KEY": sentinel}):
            process = core._bounded_process(
                [
                    sys.executable,
                    "-I",
                    "-c",
                    'import os; print(os.environ.get("NVIDIA_API_KEY", "absent"))',
                ],
                b"",
            )
            self.assertEqual(process["stdout"].strip(), b"absent")
            with tempfile.TemporaryDirectory() as temp:
                Path(temp, ".env").write_text("NVIDIA_API_KEY=" + sentinel)
                result = export.create_bundle(
                    approval_snapshot(), Path(temp) / "bundle"
                )
                with zipfile.ZipFile(result["zip_path"]) as archive:
                    self.assertNotIn(".env", archive.namelist())
                    for name in archive.namelist():
                        self.assertNotIn(sentinel.encode(), archive.read(name))

    def test_validation_execution_error_is_not_policy_failure(self):
        # A real controlled test fixture exercises process behavior without being
        # added to the production variant registry.
        with tempfile.TemporaryDirectory() as temp:
            import shutil

            fixtures = Path(temp) / "fixtures"
            shutil.copytree(core.FIXTURES, fixtures)
            artifact = fixtures / "rewrite_v2.py"
            artifact.write_text('raise RuntimeError("test execution failure")')
            manifest = json.loads((fixtures / "manifest.json").read_text())
            for variant in manifest["variants"]:
                if variant["id"] == "rewrite-v2":
                    variant["sha256"] = hashlib.sha256(
                        artifact.read_bytes()
                    ).hexdigest()
            (fixtures / "manifest.json").write_text(json.dumps(manifest))
            with patch.object(core, "FIXTURES", fixtures):
                result = export.validate("rewrite-v2", APPROVED)
            self.assertEqual(result["state"], "error")
            self.assertTrue(all(case["state"] == "error" for case in result["cases"]))

    def test_standalone_crash_is_an_error_not_an_assertion_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            result = export.create_bundle(approval_snapshot(), Path(temp) / "bundle")
            directory = Path(result["directory"])
            candidate = directory / "candidate.py"
            candidate.write_text('raise RuntimeError("controlled test crash")')
            manifest_path = directory / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["files"]["candidate.py"] = hashlib.sha256(
                candidate.read_bytes()
            ).hexdigest()
            manifest_path.write_text(json.dumps(manifest))
            process = subprocess.run(
                [sys.executable, "-I", "acceptance_tests.py"],
                cwd=directory,
                check=False,
                capture_output=True,
                timeout=10,
            )
            self.assertEqual(process.returncode, 1)
            self.assertIn(b"FAILED (errors=5)", process.stderr)


class ProcessCleanupTests(unittest.TestCase):
    def test_timeout_reaps_process_and_closes_streams(self):
        real_popen = subprocess.Popen
        processes = []

        def capture_process(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        with patch.object(core.subprocess, "Popen", capture_process):
            result = core._bounded_process(
                [sys.executable, "-I", "-c", "import time; time.sleep(20)"],
                b"",
                timeout=0.05,
            )
        self.assertEqual(result["status"], "timeout")
        for process in processes:
            self.assertIsNotNone(process.poll())
            self.assertTrue(process.stdin.closed)
            self.assertTrue(process.stdout.closed)
            self.assertTrue(process.stderr.closed)


if __name__ == "__main__":
    unittest.main()
