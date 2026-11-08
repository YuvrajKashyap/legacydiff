"""Load reviewed examples, run both versions, and check the chosen policy."""

import json
import sys
from pathlib import Path

from . import core
from .scenario_contracts import (
    SCENARIO_IDS,
    scenario_id,
    validate_cases,
    validate_output,
)
from .scenario_policies import expected_output, policy_id
from .suite_requirements import REQUIREMENTS, requirement_verdicts

FIXTURE_ROOT = core.ROOT / "fixtures"
BATCH_ENTRY = Path(__file__).with_name("suite_batch.py")
VARIANT_FILES = {"legacy_v1.py", "rewrite_v2.py", "corrected_v2.py"}


def definition(scenario):
    """Read a scenario and reject files that changed since review."""
    scenario_id(scenario)
    directory = FIXTURE_ROOT / scenario
    result = json.loads((directory / "suite.json").read_text(encoding="utf-8"))
    if result["id"] != scenario:
        raise ValueError("Scenario manifest identity mismatch")
    for entry in result["variants"] + result["evidence"]:
        filename = entry["file"]
        if type(filename) is not str or Path(filename).name != filename:
            raise ValueError("Artifact paths must remain in the reviewed suite")
        data = (directory / filename).read_bytes()
        if core.sha256(data) != entry["sha256"]:
            raise ValueError("Pinned suite artifact changed")
        entry["source"] = data.decode("utf-8-sig")
    if any(entry["file"] not in VARIANT_FILES for entry in result["variants"]):
        raise ValueError("Only reviewed variant files may execute")
    dataset = result["dataset"]
    if dataset["file"] != "corpus.json":
        raise ValueError("Unknown dataset path")
    data = (directory / "corpus.json").read_bytes()
    if core.sha256(data) != dataset["sha256"]:
        raise ValueError("Pinned suite dataset changed")
    cases = json.loads(data)
    if len(cases) != dataset["count"]:
        raise ValueError("Dataset count differs from manifest")
    validate_cases(
        scenario, [{"id": case["id"], "input": case["input"]} for case in cases]
    )
    result["dataset"] = {key: value for key, value in dataset.items() if key != "file"}
    result["dataset"]["cases"] = cases
    return result


def select_variants(config, baseline=None, candidate=None):
    """Choose reviewed versions only; a comparison must use two different versions."""
    selected = dict(config)
    known = {entry["id"] for entry in config["variants"]}
    for side, requested in [("baseline", baseline), ("candidate", candidate)]:
        value = config[side] if requested is None else requested
        if type(value) is not str or value not in known:
            raise ValueError("Unknown reviewed variant")
        selected[side] = value
    if selected["baseline"] == selected["candidate"]:
        raise ValueError("Comparison versions must be different")
    return selected


def suite_manifest():
    """Build the catalog with policy expectations, without running any example."""
    scenarios = []
    for scenario in SCENARIO_IDS:
        result = definition(scenario)
        for policy in result["policies"]:
            policy["cases"] = [
                {
                    "id": case["id"],
                    "input": case["input"],
                    "expected": expected_output(scenario, policy["id"], case["input"]),
                }
                for case in result["dataset"]["cases"]
            ]
        scenarios.append(result)
    return {"schema_version": 1, "scenarios": scenarios}


def execute_batch(scenario, variant, cases, config=None):
    """Run one reviewed version with limits on elapsed time and output size."""
    validate_cases(scenario, cases)
    config = definition(scenario) if config is None else config
    spec = next((item for item in config["variants"] if item["id"] == variant), None)
    if spec is None:
        raise ValueError("Unknown reviewed variant")
    envelope = {
        "scenario": scenario,
        "variant": variant,
        "sha256": spec["sha256"],
        "cases": cases,
    }
    # One process handles the batch to avoid starting Python for every input.
    process = core._bounded_process(
        [sys.executable, "-I", "-B", str(BATCH_ENTRY)],
        json.dumps(envelope, allow_nan=False).encode(),
        timeout=15.0,
        output_limit=1048576,
    )
    if process["status"] == "success":
        try:
            measured = json.loads(process["stdout"])
            if type(measured) is not list or len(measured) != len(cases):
                raise ValueError("Incomplete batch")
            for expected, execution in zip(cases, measured):
                if (
                    execution["case_id"] != expected["id"]
                    or execution["variant"] != variant
                    or execution["sha256"] != spec["sha256"]
                ):
                    raise ValueError("Batch identity mismatch")
                if execution["status"] == "success":
                    validate_output(scenario, execution["output"])
                elif execution["status"] != "error" or "output" in execution:
                    raise ValueError("Invalid batch execution state")
            return measured
        except (ValueError, KeyError, TypeError):
            process["status"] = "error"
            process["diagnostic"] = "Reviewed batch returned invalid output"
    # A killed/failed batch has no trustworthy complete output. Never invent
    # individual successes from planned inputs or expected policy values.
    return [
        {
            "case_id": case["id"],
            "variant": variant,
            "sha256": spec["sha256"],
            "status": process["status"],
            "diagnostic": process["diagnostic"],
            "duration_ms": process["duration_ms"],
        }
        for case in cases
    ]


def suite_compare(scenario, cases=None, baseline=None, candidate=None):
    """Compare measured outputs and check requirements on both versions."""
    config = select_variants(definition(scenario), baseline, candidate)
    if cases is None:
        cases = [
            {"id": case["id"], "input": case["input"]}
            for case in config["dataset"]["cases"]
        ]
    validate_cases(scenario, cases)
    baseline = execute_batch(scenario, config["baseline"], cases, config)
    candidate = execute_batch(scenario, config["candidate"], cases, config)
    compared, requirements = [], []
    for case, left, right in zip(cases, baseline, candidate):
        successful = left["status"] == right["status"] == "success"
        differences = (
            core.differences(left["output"], right["output"]) if successful else []
        )
        state = "error"
        if successful:
            state = "mismatch" if differences else "match"
        compared.append(
            {
                **case,
                "baseline": {
                    key: value for key, value in left.items() if key != "case_id"
                },
                "candidate": {
                    key: value for key, value in right.items() if key != "case_id"
                },
                "differences": differences,
                "state": state,
            }
        )
        # Matching outputs can share a bug, so check each version independently.
        verdicts = {}
        for side, execution in [("baseline", left), ("candidate", right)]:
            verdicts[side] = (
                requirement_verdicts(scenario, case["input"], execution["output"])
                if execution["status"] == "success"
                else None
            )
        for identifier, description in REQUIREMENTS[scenario]:
            row = {
                "id": identifier + ":" + core.sha256(case["id"].encode())[:32],
                "description": description,
                "case_id": case["id"],
            }
            for side in ["baseline", "candidate"]:
                values = verdicts[side]
                row[side] = (
                    "error"
                    if values is None
                    else ("pass" if values[identifier] else "fail")
                )
            requirements.append(row)
    return {
        "scenario": scenario,
        "baseline": config["baseline"],
        "candidate": config["candidate"],
        "cases": compared,
        "mismatch_count": sum(case["state"] == "mismatch" for case in compared),
        "error_count": sum(case["state"] == "error" for case in compared),
        "requirements": requirements,
        "dataset_hash": config["dataset"]["sha256"],
    }


def validate_policy_cases(scenario, policy, cases):
    """Reject expectations that change the chosen policy or waive required rules."""
    policy_id(scenario, policy)
    validate_cases(scenario, cases, approved=True)
    for case in cases:
        expected = expected_output(scenario, policy, case["input"])
        if core.differences(case["expected"], expected):
            raise ValueError("Expectations differ from the selected authored policy")
        if not all(requirement_verdicts(scenario, case["input"], expected).values()):
            raise ValueError("A mandatory independent requirement cannot be waived")


def suite_validate(scenario, policy, cases, candidate=None):
    """Run the candidate against approved expectations and required rules."""
    config = definition(scenario)
    # Validation checks one version, so it may also target the usual baseline.
    if candidate is not None:
        if type(candidate) is not str or candidate not in {
            item["id"] for item in config["variants"]
        }:
            raise ValueError("Unknown reviewed variant")
        config["candidate"] = candidate
    validate_policy_cases(scenario, policy, cases)
    inputs = [{"id": case["id"], "input": case["input"]} for case in cases]
    executions = execute_batch(scenario, config["candidate"], inputs, config)
    results = []
    for case, execution in zip(cases, executions):
        row = {"id": case["id"], "expected": case["expected"], "state": "error"}
        if execution["status"] == "success":
            actual = execution["output"]
            row["actual"] = actual
            meets_requirements = all(
                requirement_verdicts(scenario, case["input"], actual).values()
            )
            row["state"] = (
                "pass"
                if not core.differences(actual, case["expected"]) and meets_requirements
                else "fail"
            )
        results.append(row)
    state = "pass"
    if any(case["state"] == "error" for case in results):
        state = "error"
    elif any(case["state"] == "fail" for case in results):
        state = "fail"
    candidate = next(
        item for item in config["variants"] if item["id"] == config["candidate"]
    )
    return {"state": state, "cases": results, "candidateHash": candidate["sha256"]}
