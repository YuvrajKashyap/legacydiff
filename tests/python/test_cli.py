import json
import subprocess
import sys
import unittest


class CliTests(unittest.TestCase):
    def call(self, value):
        result = subprocess.run(
            [sys.executable, "-m", "backend.runner.cli"],
            input=json.dumps(value).encode(),
            check=False,
            capture_output=True,
            timeout=15,
        )
        return result, json.loads(result.stdout or b"null")

    def test_compare_cli_measures_mismatch(self):
        process, result = self.call(
            {"op": "compare", "baseline": "legacy-v1", "candidate": "rewrite-v2"}
        )
        self.assertEqual(process.returncode, 0)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["mismatch_count"], 1)

    def test_cli_rejects_unknown_fields_and_operations(self):
        for request in [
            {"op": "shell", "command": "anything"},
            {"op": "manifest", "path": "../../secret"},
        ]:
            process, result = self.call(request)
            self.assertEqual(process.returncode, 1)
            self.assertIsInstance(result, dict)
            self.assertEqual(result["status"], "error")


if __name__ == "__main__":
    unittest.main()
