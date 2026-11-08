"""Handle one JSON request from the trusted worker, never a public client."""

import json
import sys

from . import core, export, suites
from .suite_export import suite_export


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _reject_nonfinite(_value):
    raise ValueError("Nonfinite number")


def dispatch(request):
    """Accept only known operations and their exact request fields."""
    if type(request) is not dict:
        raise ValueError("Request must be an object")
    op = request.get("op")
    # Keep the original returns operations alongside the newer scenario operations.
    allowed = {
        "manifest": ({"op"}, {"op"}),
        "suite_manifest": ({"op"}, {"op"}),
        "suite_compare": (
            {"op", "scenario"},
            {"op", "scenario", "cases", "baseline", "candidate"},
        ),
        "suite_validate": (
            {"op", "scenario", "policy", "cases"},
            {"op", "scenario", "policy", "cases", "candidate"},
        ),
        "suite_export": (
            {"op", "scenario", "snapshot", "output_dir"},
            {"op", "scenario", "snapshot", "output_dir"},
        ),
        "compare": (
            {"op", "baseline", "candidate"},
            {"op", "baseline", "candidate", "cases"},
        ),
        "validate": (
            {"op", "variant", "approved_cases"},
            {"op", "variant", "approved_cases"},
        ),
        "export": ({"op", "snapshot", "output_dir"}, {"op", "snapshot", "output_dir"}),
    }
    if type(op) is not str or op not in allowed:
        raise ValueError("Unknown operation")
    required, permitted = allowed[op]
    if not required <= set(request) or not set(request) <= permitted:
        raise ValueError("Invalid request fields")
    for side in ["baseline", "candidate"]:
        if (
            op in {"suite_compare", "suite_validate"}
            and side in request
            and type(request[side]) is not str
        ):
            raise ValueError("Variant selection must be an ID")
    if op == "suite_manifest":
        return suites.suite_manifest()
    if op == "suite_compare":
        return suites.suite_compare(
            request["scenario"],
            request.get("cases"),
            request.get("baseline"),
            request.get("candidate"),
        )
    if op == "suite_validate":
        return suites.suite_validate(
            request["scenario"],
            request["policy"],
            request["cases"],
            request.get("candidate"),
        )
    if op == "suite_export":
        if type(request["output_dir"]) is not str or not request["output_dir"]:
            raise ValueError("Invalid worker output directory")
        return suite_export(
            request["scenario"], request["snapshot"], request["output_dir"]
        )
    if op == "manifest":
        return {**core.manifest(), "initial_cases": core.initial_cases()}
    if op == "compare":
        return core.compare(
            request["baseline"], request["candidate"], request.get("cases")
        )
    if op == "validate":
        return export.validate(request["variant"], request["approved_cases"])
    if type(request["output_dir"]) is not str or not request["output_dir"]:
        raise ValueError("Invalid worker output directory")
    return export.create_bundle(request["snapshot"], request["output_dir"])


def main():
    """Read a size-limited request and return one JSON result or safe error."""
    try:
        raw = sys.stdin.buffer.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("Request size limit exceeded")
        request = json.loads(
            raw,
            object_pairs_hook=_object,
            parse_constant=_reject_nonfinite,
        )
        result = dispatch(request)
        print(json.dumps(result, allow_nan=False))
        return 0
    except (ValueError, TypeError, KeyError, OSError) as error:
        # Report the kind of failure without exposing local paths or source text.
        print(
            json.dumps(
                {
                    "status": "error",
                    "diagnostic": "Runner request rejected",
                    "error_type": type(error).__name__,
                }
            )
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
