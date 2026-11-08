"""Run mandatory independent requirements against both reviewed implementations."""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_local(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IndependentRequirements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.acceptance = load_local("acceptance_tests")
        cls.manifest = cls.acceptance.checked_bundle()
        cls.rules = load_local("independent_requirements")
        cls.cases = json.loads((ROOT / "dataset.json").read_text(encoding="utf-8"))[
            "cases"
        ]

    def test_both_implementations_independently(self):
        for filename in ["baseline.py", "candidate.py"]:
            for case in self.cases:
                output = self.acceptance.execute(filename, case["input"])
                verdicts = self.rules.requirement_verdicts(
                    self.manifest["scenario"], case["input"], output
                )
                for identifier, passed in verdicts.items():
                    with self.subTest(
                        implementation=filename, case=case["id"], requirement=identifier
                    ):
                        self.assertTrue(passed)


if __name__ == "__main__":
    unittest.main()
