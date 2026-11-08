"""Trusted worker boundary: caller supplies the committed immutable approval snapshot."""

import json
import shutil
from pathlib import Path

from . import core

TEMPLATE = Path(__file__).with_name("acceptance_template.py")


def validate(variant, approved_cases):
    core.validate_cases(approved_cases, approved=True)
    results = []
    for case in approved_cases:
        execution = core.execute(variant, {"id": case["id"], "input": case["input"]})
        state = "error"
        if execution["status"] == "success":
            state = (
                "pass"
                if not core.differences(execution["output"], case["expected"])
                else "fail"
            )
        results.append(
            {
                "id": case["id"],
                "input": case["input"],
                "expected": case["expected"],
                "actual": execution.get("output"),
                "state": state,
                "execution": execution,
            }
        )
    if any(case["state"] == "error" for case in results):
        state = "error"
    elif any(case["state"] == "fail" for case in results):
        state = "fail"
    else:
        state = "pass"
    return {
        "schema_version": 1,
        "variant": variant,
        "state": state,
        "cases": results,
        "runner_mode": core.RUNNER_MODE,
    }


def create_bundle(snapshot, output_dir):
    if type(snapshot) is not dict or set(snapshot) != {
        "decision",
        "approved_cases",
        "candidate",
        "evidence",
        "run_results",
    }:
        raise ValueError("Invalid export snapshot")
    decision = snapshot["decision"]
    fields = {
        "version",
        "proposal_revision",
        "reviewer",
        "rationale",
        "choice",
        "approved_at",
    }
    if type(decision) is not dict or set(decision) != fields:
        raise ValueError("A committed approval snapshot is required")
    if any(
        type(decision[k]) is not int or decision[k] < 1
        for k in ["version", "proposal_revision"]
    ):
        raise ValueError("Invalid approval versions")
    if decision["choice"] not in ["include", "exclude"] or any(
        type(decision[k]) is not str or not 1 <= len(decision[k]) <= 4000
        for k in ["reviewer", "rationale", "approved_at"]
    ):
        raise ValueError("Invalid approval metadata")
    core.validate_cases(snapshot["approved_cases"], approved=True)
    config = core.manifest()
    candidate = next(
        (v for v in config["variants"] if v["id"] == snapshot["candidate"]), None
    )
    if candidate is None:
        raise ValueError("Unknown candidate")
    # Evidence bytes must match our reviewed artifact snapshot; metadata never grants authority.
    if type(snapshot["evidence"]) is not list or len(snapshot["evidence"]) != 2:
        raise ValueError("Both pinned policy artifacts are required")
    expected = {v["id"]: v for v in config["evidence"]}
    if {e.get("id") for e in snapshot["evidence"]} != set(expected):
        raise ValueError("Missing evidence")
    for entry in snapshot["evidence"]:
        source = expected[entry["id"]]
        if (
            entry.get("sha256") != source["sha256"]
            or entry.get("source") != source["source"]
        ):
            raise ValueError("Evidence snapshot differs from pinned bytes")
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=False)

    def write_json(name, value):
        (output_dir / name).write_text(
            json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8"
        )

    shutil.copyfile(TEMPLATE, output_dir / "acceptance_tests.py")
    shutil.copyfile(core.FIXTURES / candidate["file"], output_dir / "candidate.py")
    for name in ["decision", "approved_cases", "evidence", "run_results"]:
        write_json(name + ".json", snapshot[name])
    (output_dir / "README.md").write_text(
        "# LegacyDiff review bundle\n\nSynthetic example. Requires Python 3.11+ standard library only.\n\nRun `python -I acceptance_tests.py` from this directory. A nonzero exit with assertion failures means the candidate violates the human-approved expectations; it is not a failed export. Integrity or execution errors are distinct from assertion failures.\n\nCandidate: "
        + candidate["id"]
        + "\n\nNo Spacetime, NVIDIA, network, or UI needed. Source hashes and immutable decision versions are in manifest.json and decision.json. This bundle contains only trusted synthetic fixtures and is not an arbitrary-code sandbox.\n",
        encoding="utf-8",
    )
    files = {
        p.name: core.sha256(p.read_bytes())
        for p in sorted(output_dir.iterdir())
        if p.is_file()
    }
    write_json(
        "manifest.json",
        {
            "schema_version": 1,
            "fixture_version": config["fixture_version"],
            "runner_version": 1,
            "template_version": 1,
            "template_sha256": core.sha256(TEMPLATE.read_bytes()),
            "candidate": candidate["id"],
            "candidate_sha256": candidate["sha256"],
            "decision_version": decision["version"],
            "proposal_revision": decision["proposal_revision"],
            "files": files,
        },
    )
    zip_path = shutil.make_archive(str(output_dir), "zip", output_dir)
    return {
        "directory": str(output_dir),
        "zip_path": zip_path,
        "command": "python -I acceptance_tests.py",
        "candidate": candidate["id"],
        "decision_version": decision["version"],
    }
