"""Run only the reviewed local examples; this cannot safely run user code."""

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures" / "returns"
MAX_CASES = 20
RUNNER_MODE = "trusted-fixture local fallback (reduced isolation; local-only)"
REASONS = {"final_sale", "missing_receipt", "outside_window", "eligible"}


def validate_input(value):
    if type(value) is not dict or set(value) != {
        "age_days",
        "price_cents",
        "has_receipt",
        "final_sale",
    }:
        raise ValueError("Invalid input fields")
    for key, maximum in [("age_days", 365), ("price_cents", 1000000)]:
        if type(value[key]) is not int or not 0 <= value[key] <= maximum:
            raise ValueError(f"{key} must be an integer between 0 and {maximum}")
    for key in ["has_receipt", "final_sale"]:
        if type(value[key]) is not bool:
            raise ValueError(f"{key} must be boolean")
    return dict(value)


def validate_output(value):
    if type(value) is not dict or set(value) != {"eligible", "refund_cents", "reason"}:
        raise ValueError("Invalid output fields")
    if (
        type(value["eligible"]) is not bool
        or type(value["refund_cents"]) is not int
        or not 0 <= value["refund_cents"] <= 1000000
    ):
        raise ValueError("Invalid output types or bounds")
    if type(value["reason"]) is not str or value["reason"] not in REASONS:
        raise ValueError("Invalid output reason")
    if value["eligible"] != (value["reason"] == "eligible") or (
        not value["eligible"] and value["refund_cents"] != 0
    ):
        raise ValueError("Inconsistent output")
    return dict(value)


def _equal(left, right):
    if type(left) is not type(right):
        return False
    if type(left) is dict:
        return set(left) == set(right) and all(_equal(left[k], right[k]) for k in left)
    if type(left) is list:
        return len(left) == len(right) and all(
            _equal(a, b) for a, b in zip(left, right)
        )
    return left == right


def differences(left, right):
    return [
        key
        for key in sorted(set(left) | set(right))
        if key not in left or key not in right or not _equal(left[key], right[key])
    ]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def manifest():
    """Load the returns catalog and verify the reviewed file hashes."""
    result = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
    for entry in result["variants"] + result["evidence"]:
        data = (FIXTURES / entry["file"]).read_bytes()
        if sha256(data) != entry["sha256"]:
            raise ValueError("Bundled artifact hash mismatch: " + entry["id"])
        entry["source"] = data.decode("utf-8")
        entry["provenance"] = "Local fixture"
    result["runner_mode"] = RUNNER_MODE
    return result


def initial_cases():
    common = {"price_cents": 10000, "has_receipt": True, "final_sale": False}
    return [
        {"id": f"day-{day}", "input": {**common, "age_days": day}}
        for day in [29, 30, 31]
    ] + [
        {
            "id": "missing-receipt",
            "input": {**common, "age_days": 30, "has_receipt": False},
        },
        {"id": "final-sale", "input": {**common, "age_days": 30, "final_sale": True}},
    ]


def validate_cases(cases, approved=False):
    if type(cases) is not list or not 1 <= len(cases) <= MAX_CASES:
        raise ValueError("Cases must contain 1 to 20 entries")
    seen = set()
    for case in cases:
        expected_keys = {"id", "input", "expected"} if approved else {"id", "input"}
        if type(case) is not dict or set(case) != expected_keys:
            raise ValueError("Invalid case fields")
        if (
            type(case["id"]) is not str
            or not 1 <= len(case["id"]) <= 80
            or case["id"] in seen
        ):
            raise ValueError("Case IDs must be unique bounded strings")
        seen.add(case["id"])
        validate_input(case["input"])
        if approved:
            validate_output(case["expected"])
    return cases


def _bounded_process(command, payload, timeout=3.0, output_limit=65536, cancel=None):
    """Collect process output while enforcing time, size, and cancellation limits."""
    env = {
        key: os.environ[key]
        for key in ["SYSTEMROOT", "WINDIR", "TEMP", "TMP"]
        if key in os.environ
    }
    proc = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    buffers = [bytearray(), bytearray()]
    excessive = threading.Event()

    def drain(pipe, buffer):
        while True:
            chunk = pipe.read(4096)
            if not chunk:
                break
            remaining = max(0, output_limit - len(buffer))
            buffer.extend(chunk[:remaining])
            if len(chunk) > remaining:
                excessive.set()
                proc.kill()
                break
        pipe.close()

    # Drain both streams together so a full error pipe cannot stall the child.
    threads = [
        threading.Thread(target=drain, args=(pipe, buffer), daemon=True)
        for pipe, buffer in zip([proc.stdout, proc.stderr], buffers)
    ]
    for thread in threads:
        thread.start()
    started = time.monotonic()
    status = "success"
    try:
        try:
            proc.stdin.write(payload)
            proc.stdin.close()
        except BrokenPipeError:
            pass
        while proc.poll() is None:
            if cancel is not None and cancel.is_set():
                status = "cancelled"
                proc.kill()
                break
            if time.monotonic() - started >= timeout:
                status = "timeout"
                proc.kill()
                break
            time.sleep(0.005)
        proc.wait(timeout=2)
    finally:
        # Wait for the child to exit before releasing its pipes and returning.
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        for thread in threads:
            thread.join(timeout=2)
    diagnostic = None
    if excessive.is_set():
        status, diagnostic = "error", "Execution output limit exceeded"
    elif status == "timeout":
        diagnostic = "Execution timed out"
    elif status == "cancelled":
        diagnostic = "Execution cancelled"
    elif proc.returncode != 0:
        status, diagnostic = "error", "Fixture process failed"
    return {
        "status": status,
        "stdout": bytes(buffers[0]),
        "diagnostic": diagnostic,
        "duration_ms": round((time.monotonic() - started) * 1000, 3),
    }


def execute(variant, case, timeout=3.0, cancel=None):
    """Run a known returns version and accept only a valid JSON result."""
    validate_cases([case])
    spec = next((v for v in manifest()["variants"] if v["id"] == variant), None)
    if spec is None:
        raise ValueError("Unknown fixture variant")
    result = _bounded_process(
        [sys.executable, "-I", "-B", str(FIXTURES / spec["file"])],
        json.dumps(case["input"]).encode(),
        timeout,
        cancel=cancel,
    )
    result.update(
        {
            "variant": variant,
            "sha256": spec["sha256"],
            "case_id": case["id"],
            "runner_mode": RUNNER_MODE,
        }
    )
    output = result.pop("stdout")
    if result["status"] == "success":
        try:
            result["output"] = validate_output(json.loads(output))
        except (ValueError, UnicodeError):
            result.update(
                status="error", diagnostic="Fixture returned invalid JSON/output"
            )
    return result


def compare(baseline, candidate, cases=None):
    """Compare real outputs; a failed execution is an error, never a match."""
    if [baseline, candidate] not in manifest()["compatible_pairs"]:
        raise ValueError("Unsupported source pair")
    cases = validate_cases(initial_cases() if cases is None else cases)
    measured = []
    for case in cases:
        left, right = execute(baseline, case), execute(candidate, case)
        success = left["status"] == right["status"] == "success"
        diff = differences(left["output"], right["output"]) if success else []
        if not success:
            state = "error"
        elif diff:
            state = "mismatch"
        else:
            state = "match"
        measured.append(
            {
                **case,
                "baseline": left,
                "candidate": right,
                "differences": diff,
                "state": state,
            }
        )
    return {
        "schema_version": 1,
        "baseline": baseline,
        "candidate": candidate,
        "cases": measured,
        "mismatch_count": sum(c["state"] == "mismatch" for c in measured),
        "error_count": sum(c["state"] == "error" for c in measured),
        "runner_mode": RUNNER_MODE,
    }
