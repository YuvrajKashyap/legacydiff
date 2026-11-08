"""Private one-request JSON stdin/stdout interface. Never expose as a public service."""

import json
import sys

from . import core, export


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
    if type(request) is not dict:
        raise ValueError("Request must be an object")
    op = request.get("op")
    allowed = {
        "manifest": ({"op"}, {"op"}),
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
        # Exception class is useful; absolute paths and source snippets are not.
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
