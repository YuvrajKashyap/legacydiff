"""Strict contracts for the four reviewed synthetic suites."""

from . import core

SCENARIO_IDS = ("returns", "pricing", "accounts-payable", "permissions")
PEOPLE = {
    "employee-a",
    "employee-b",
    "manager-a",
    "manager-b",
    "finance-a",
    "finance-b",
}
MAX_SUITE_CASES = 128


def fields(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError("Unexpected or missing scenario fields")


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError("Integer outside the reviewed contract")


def boolean(value):
    if type(value) is not bool:
        raise ValueError("Expected a boolean")


def enumeration(value, permitted):
    if type(value) is not str or value not in permitted:
        raise ValueError("Unknown contract value")


def scenario_id(value):
    enumeration(value, SCENARIO_IDS)
    return value


def validate_input(scenario, value):
    scenario_id(scenario)
    if scenario == "returns":
        return core.validate_input(value)
    if scenario == "pricing":
        fields(
            value,
            [
                "quantity",
                "unit_price_cents",
                "volume_discount_bps",
                "price_includes_discount",
                "currency",
            ],
        )
        integer(value["quantity"], 0, 1000)
        integer(value["unit_price_cents"], 0, 1000000)
        integer(value["volume_discount_bps"], 0, 5000)
        boolean(value["price_includes_discount"])
        enumeration(value["currency"], {"USD", "EUR"})
    elif scenario == "accounts-payable":
        fields(
            value,
            [
                "subtotal_cents",
                "tax_cents",
                "submitter",
                "approver_one",
                "approver_two",
            ],
        )
        integer(value["subtotal_cents"], 0, 10000000)
        integer(value["tax_cents"], 0, 2000000)
        for key in ["submitter", "approver_one", "approver_two"]:
            enumeration(value[key], PEOPLE)
    else:
        fields(
            value,
            [
                "authenticated",
                "role_allow",
                "explicit_deny",
                "subject_tenant",
                "resource_tenant",
                "action",
            ],
        )
        for key in ["authenticated", "role_allow", "explicit_deny"]:
            boolean(value[key])
        for key in ["subject_tenant", "resource_tenant"]:
            enumeration(value[key], {"acme", "globex"})
        enumeration(value["action"], {"read", "write", "delete", "unknown"})
    return dict(value)


def validate_output(scenario, value):
    scenario_id(scenario)
    if scenario == "returns":
        return core.validate_output(value)
    if scenario == "pricing":
        fields(
            value,
            [
                "currency",
                "subtotal_cents",
                "discount_cents",
                "total_cents",
                "discount_applied",
                "reason",
            ],
        )
        enumeration(value["currency"], {"USD", "EUR"})
        for key in ["subtotal_cents", "discount_cents", "total_cents"]:
            integer(value[key], 0, 1000000000)
        boolean(value["discount_applied"])
        enumeration(
            value["reason"], {"discount_applied", "already_discounted", "no_discount"}
        )
    elif scenario == "accounts-payable":
        fields(
            value,
            [
                "routing",
                "basis_cents",
                "required_approvals",
                "eligible_approvers",
                "ready",
                "reason",
            ],
        )
        enumeration(value["routing"], {"standard", "enhanced"})
        integer(value["basis_cents"], 0, 12000000)
        integer(value["required_approvals"], 1, 2)
        bounded_list(value["eligible_approvers"], PEOPLE, 2)
        boolean(value["ready"])
        enumeration(value["reason"], {"ready", "insufficient_approvers"})
    else:
        fields(value, ["allowed", "reason", "protected_fields"])
        boolean(value["allowed"])
        enumeration(value["reason"], {"role_allow", "default_deny"})
        bounded_list(value["protected_fields"], {"record_id", "balance_cents"}, 2)
    return dict(value)


def bounded_list(value, permitted, maximum):
    if type(value) is not list or len(value) > maximum:
        raise ValueError("Invalid bounded output list")
    for item in value:
        enumeration(item, permitted)


def validate_cases(scenario, cases, approved=False):
    if type(cases) is not list or not 1 <= len(cases) <= MAX_SUITE_CASES:
        raise ValueError("Suite scope must contain 1 to 128 cases")
    seen = set()
    for case in cases:
        expected = {"id", "input", "expected"} if approved else {"id", "input"}
        if type(case) is not dict or set(case) != expected:
            raise ValueError("Unexpected case fields")
        identifier = case["id"]
        if (
            type(identifier) is not str
            or not 1 <= len(identifier) <= 80
            or identifier in seen
        ):
            raise ValueError("Case IDs must be unique bounded strings")
        seen.add(identifier)
        validate_input(scenario, case["input"])
        if approved:
            validate_output(scenario, case["expected"])
    return cases
