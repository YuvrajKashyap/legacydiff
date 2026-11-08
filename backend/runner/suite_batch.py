"""Fixed batch entry point for allowlisted local fixtures, not user programs."""

import json
import runpy
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.runner import core
from backend.runner.scenario_contracts import validate_cases, validate_output
from backend.runner.suites import FIXTURE_ROOT, definition


def main():
    request = json.loads(sys.stdin.buffer.read(1048577))
    if type(request) is not dict or set(request) != {
        "scenario",
        "variant",
        "sha256",
        "cases",
    }:
        raise ValueError("Invalid batch request")
    config = definition(request["scenario"])
    validate_cases(request["scenario"], request["cases"])
    variant = next(
        item for item in config["variants"] if item["id"] == request["variant"]
    )
    if variant["sha256"] != request["sha256"]:
        raise ValueError("Pinned batch source changed")
    path = FIXTURE_ROOT / request["scenario"] / variant["file"]
    if core.sha256(path.read_bytes()) != variant["sha256"]:
        raise ValueError("Source changed before execution")
    evaluate = runpy.run_path(str(path), run_name="reviewed_fixture")["evaluate"]
    results = []
    for case in request["cases"]:
        started = time.perf_counter()
        execution = {
            "case_id": case["id"],
            "variant": variant["id"],
            "sha256": variant["sha256"],
            "status": "success",
            "diagnostic": None,
        }
        try:
            execution["output"] = validate_output(
                request["scenario"], evaluate(case["input"])
            )
        except Exception:  # noqa: BLE001 - contain fixture failures as case errors.
            execution["status"] = "error"
            execution["diagnostic"] = (
                "Reviewed fixture failed or returned invalid output"
            )
        execution["duration_ms"] = round((time.perf_counter() - started) * 1000, 6)
        results.append(execution)
    print(json.dumps(results, allow_nan=False))


if __name__ == "__main__":
    main()
