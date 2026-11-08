"""Create standalone suite bundles from a committed, version-bound review snapshot."""

import json
import shutil
from pathlib import Path

from . import core
from .scenario_contracts import fields, integer, validate_cases, validate_output
from .suites import FIXTURE_ROOT, definition, select_variants, validate_policy_cases

HERE = Path(__file__).resolve().parent
DECISION_FIELDS = {
    "version",
    "proposal_revision",
    "reviewer",
    "rationale",
    "policy",
    "approved_at",
}


def checked_snapshot(scenario, snapshot):
    fields(snapshot, {"decision", "cases", "evidence", "comparison", "validation"})
    decision = snapshot["decision"]
    fields(decision, DECISION_FIELDS)
    for name in ["version", "proposal_revision"]:
        integer(decision[name], 1, 1000000)
    for name in ["reviewer", "rationale", "policy", "approved_at"]:
        if type(decision[name]) is not str or not 1 <= len(decision[name]) <= 4000:
            raise ValueError("Invalid committed decision metadata")
    validate_policy_cases(scenario, decision["policy"], snapshot["cases"])
    config = definition(scenario)
    evidence = snapshot["evidence"]
    if type(evidence) is not list or len(evidence) != len(config["evidence"]):
        raise ValueError("The complete pinned evidence snapshot is required")
    if {item["id"] for item in evidence} != {item["id"] for item in config["evidence"]}:
        raise ValueError("Evidence IDs differ from the reviewed suite")
    for item in evidence:
        fields(
            item, {"id", "title", "file", "sha256", "source", "line_start", "line_end"}
        )
        pinned = next(
            entry for entry in config["evidence"] if entry["id"] == item["id"]
        )
        if item != pinned:
            raise ValueError("Evidence differs from pinned source bytes")
    comparison = snapshot["comparison"]
    fields(
        comparison,
        {
            "scenario",
            "baseline",
            "candidate",
            "cases",
            "mismatch_count",
            "error_count",
            "requirements",
            "dataset_hash",
        },
    )
    # Use the saved selection for every source copy and hash in this bundle.
    for side in ["baseline", "candidate"]:
        if type(comparison[side]) is not str:
            raise ValueError("Comparison variant must be an ID")
    config = select_variants(config, comparison["baseline"], comparison["candidate"])
    if (
        comparison["scenario"] != scenario
        or comparison["dataset_hash"] != config["dataset"]["sha256"]
    ):
        raise ValueError("Comparison source or dataset snapshot mismatch")
    validate_cases(
        scenario,
        [{"id": case["id"], "input": case["input"]} for case in comparison["cases"]],
    )
    pinned = {entry["id"]: entry["sha256"] for entry in config["variants"]}
    for case in comparison["cases"]:
        fields(case, {"id", "input", "baseline", "candidate", "differences", "state"})
        for side in ["baseline", "candidate"]:
            execution = case[side]
            expected_fields = {
                "status",
                "diagnostic",
                "sha256",
                "variant",
                "duration_ms",
            }
            if execution.get("status") == "success":
                expected_fields.add("output")
                validate_output(scenario, execution["output"])
            elif execution.get("status") not in {"error", "timeout", "cancelled"}:
                raise ValueError("Unknown execution status")
            fields(execution, expected_fields)
            if (
                execution["variant"] != config[side]
                or execution["sha256"] != pinned[config[side]]
            ):
                raise ValueError("Execution source hash differs from approved suite")
    validation = snapshot["validation"]
    fields(validation, {"state", "cases", "candidateHash"})
    if validation["candidateHash"] != pinned[config["candidate"]] or len(
        validation["cases"]
    ) != len(snapshot["cases"]):
        raise ValueError("Validation version or scope mismatch")
    for result, approved in zip(validation["cases"], snapshot["cases"]):
        keys = {"id", "expected", "state"}
        if "actual" in result:
            keys.add("actual")
            validate_output(scenario, result["actual"])
        fields(result, keys)
        if result["id"] != approved["id"] or core.differences(
            result["expected"], approved["expected"]
        ):
            raise ValueError("Validation expectations differ from approval")
        state = "error"
        if "actual" in result:
            state = (
                "fail"
                if core.differences(result["actual"], result["expected"])
                else "pass"
            )
        if result["state"] != state:
            raise ValueError("Validation verdict differs from actual output")
    summary = "pass"
    if any(case["state"] == "error" for case in validation["cases"]):
        summary = "error"
    elif any(case["state"] == "fail" for case in validation["cases"]):
        summary = "fail"
    if validation["state"] != summary:
        raise ValueError("Validation summary mismatch")
    return config


def suite_export(scenario, snapshot, output_dir):
    config = checked_snapshot(scenario, snapshot)
    output_dir = Path(output_dir).resolve()
    if output_dir.exists() or Path(str(output_dir) + ".zip").exists():
        raise ValueError("Refusing to overwrite an existing export")
    output_dir.mkdir(parents=True)

    def write_json(name, value):
        (output_dir / name).write_text(
            json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8"
        )

    variants = {item["id"]: item for item in config["variants"]}
    for side in ["baseline", "candidate"]:
        spec = variants[config[side]]
        shutil.copyfile(
            FIXTURE_ROOT / scenario / spec["file"], output_dir / (side + ".py")
        )
    for source, destination in [
        ("suite_acceptance_template.py", "acceptance_tests.py"),
        ("suite_requirement_template.py", "requirement_tests.py"),
        ("suite_requirements.py", "independent_requirements.py"),
    ]:
        shutil.copyfile(HERE / source, output_dir / destination)
    write_json("approved_cases.json", snapshot["cases"])
    write_json("decision.json", snapshot["decision"])
    write_json("evidence.json", snapshot["evidence"])
    write_json(
        "run_results.json",
        {"comparison": snapshot["comparison"], "validation": snapshot["validation"]},
    )
    write_json("dataset.json", config["dataset"])
    shutil.copyfile(FIXTURE_ROOT / scenario / "corpus.json", output_dir / "corpus.json")
    (output_dir / "README.md").write_text(
        "# LegacyDiff synthetic scenario review\n\n"
        f"Scenario: {scenario}. Python 3.11+ standard library only.\n\n"
        "Run `python -I acceptance_tests.py` to check the candidate against the exact human-approved cases. "
        "Run `python -I requirement_tests.py` separately to check mandatory independent requirements against BOTH implementations over the pinned dataset. "
        "A known baseline or shared defect can fail the second command even when parity or the candidate acceptance command passes.\n\n"
        "Assertion failures represent observed policy/requirement violations. Execution/integrity errors are distinct. "
        "No UI, Spacetime, NVIDIA, or network is needed. Source and dataset hashes, policy choice, and decision versions are included. "
        "Only reviewed synthetic fixtures are supported; this is not an arbitrary-code sandbox. "
        "These files preserve the recorded review; export creation itself does not claim the standalone commands have been run.\n",
        encoding="utf-8",
    )
    files = {
        path.name: core.sha256(path.read_bytes())
        for path in sorted(output_dir.iterdir())
        if path.is_file()
    }
    write_json(
        "manifest.json",
        {
            "schema_version": 1,
            "scenario": scenario,
            "runner_version": "suite-1",
            "template_version": "suite-1",
            "dataset_version": config["dataset"]["version"],
            "dataset_hash": config["dataset"]["sha256"],
            "source_hashes": {
                side: variants[config[side]]["sha256"]
                for side in ["baseline", "candidate"]
            },
            "decision_version": snapshot["decision"]["version"],
            "proposal_revision": snapshot["decision"]["proposal_revision"],
            "policy": snapshot["decision"]["policy"],
            "files": files,
        },
    )
    return {"zip_path": shutil.make_archive(str(output_dir), "zip", output_dir)}
