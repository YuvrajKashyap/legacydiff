# Reviewed synthetic scenario suites

Implementation status: authored November 8, 2026. The user subsequently authorized one real comparison per scenario; all four runs completed in the local app with 96 inputs each. This does not replace the deferred full test suite, approval/concurrency checks, or standalone export verification. No measured result is hard-coded in these fixture definitions; saved results live in the local database. See docs/VERIFICATION.md for run IDs and the later source reorganization checkpoint.

The original returns manifest, five-case default runner, API operations, and exports remain separate for compatibility. The additive `suite_*` operations expose four scenarios with 96 deterministic inputs each (384 inputs total). These synthetic corpora are illustrative, not exhaustive proof of equivalence, financial controls, or security.

| Scenario | Main difference | Authored policy choices | Independent requirements |
| --- | --- | --- | --- |
| `returns` | Inclusive versus exclusive day 30 | `include`, `exclude` | Receipt/final-sale constraints and refund consistency |
| `pricing` | Reapplying a volume discount already included in a quote | `no-stacking`, `stack-discount` | Currency, integer money conservation, half-up rounding, quantity threshold |
| `accounts-payable` | Net versus gross routing threshold and submitter exclusion | `gross-threshold`, `net-threshold` | Distinct eligible approvers, no submitter approval, sufficient approval count |
| `permissions` | Deny-overrides rewrite retains a cross-tenant defect shared with legacy | **Only** `deny-overrides` | Explicit deny, default deny, tenant isolation, no protected fields when mandatory policy denies |

Permission controls cannot be waived by choosing baseline parity. The permissions policy is marked `security_required: true`. AP eligibility and submitter controls remain mandatory under either business threshold interpretation. Matching implementation outputs may still fail independent requirements.

## Ownership and generated records

- Each directory contains `legacy_v1.py`, `rewrite_v2.py`, and `corrected_v2.py`. Corrections are supplied reviewed examples, not AI repairs. Only baseline/rewrite are the fixed pair in each new suite API.
- Existing returns variant IDs stay `legacy-v1`, `rewrite-v2`, `corrected-v2`; other IDs are prefixed by their scenario (for example `pricing-rewrite-v2`).
- `generate_suites.py` is an authoring tool. It generates **inputs**, synthetic evidence, and SHA256 metadata. It never imports or executes variants and never generates observed output.
- `corpus.json` contains 96 `{id,input,category}` records. `suite.json` pins its bytes, categories, source/evidence hashes, owner, and policy metadata.
- `backend/runner/scenario_policies.py` independently authors each policy's expected outputs. These values are proposed expectations, not measured results. The manifest exposes them as reviewable policy cases.
- `backend/runner/suite_requirements.py` owns the independent predicates. Runtime evaluation and exported requirement checks share this reviewed source rather than copying divergent rules.

When an intentional source/corpus change is approved, run `python fixtures/generate_suites.py` to regenerate metadata. Do not refresh hashes merely to bypass a mismatch at runtime. Regeneration changes the pinned source/dataset identity; existing runs must keep their earlier snapshot or refuse incompatible re-execution.

## Exact private runner operations

Send one JSON request on stdin to `python -m backend.runner.cli`. These operations are invoked only by the private trusted worker, never an arbitrary public execution endpoint.

- `{"op":"suite_manifest"}` returns `{schema_version:1,scenarios:[...]}`. Each definition includes `id,title,description,decision_owner,baseline,candidate,variants,evidence,policies,dataset`. Policy cases contain `{id,input,expected}`; dataset cases additionally carry `category`. Dataset version is the string `"1"`.
- `{"op":"suite_compare","scenario":"permissions"}` compares the complete 96-case dataset. Optional `cases` is a bounded list of **1–128** `{id,input}` records without category. It returns `scenario,baseline,candidate,cases,mismatch_count,error_count,requirements,dataset_hash`. Executions expose `status,diagnostic,sha256,variant,duration_ms` and successful `output`. Result states are `match|mismatch|error`. Requirement rows contain unique `id`, `description`, `case_id`, and independent `baseline`/`candidate` verdicts (`pass|fail|error`). An inapplicable implication is a pass, not evidence that its premise occurred.
- `{"op":"suite_validate","scenario":"pricing","policy":"no-stacking","cases":[...]}` validates the fixed suite candidate against the approved cases. Provided expectations must exactly match the selected authored policy, and policy expectations must satisfy mandatory requirements. Returns `{state,cases:[{id,expected,actual?,state}],candidateHash}`. No `actual` is attached to execution errors. This function is not authorization; the worker must supply only a committed approval job.
- `{"op":"suite_export","scenario":"pricing","snapshot":{...},"output_dir":"<new trusted worker directory>"}` returns `{zip_path}`. Snapshot keys are exactly `decision,cases,evidence,comparison,validation`. Decision keys are exactly `version,proposal_revision,reviewer,rationale,policy,approved_at`. The caller assembles them from one authorized immutable persisted version. Existing export directories/ZIPs are not overwritten.

## Input contracts

Unknown fields, incorrect scalar types, boolean integers, and out-of-range values are rejected.

- Returns: original `age_days` integer 0–365, `price_cents` integer 0–1,000,000, `has_receipt` and `final_sale` booleans.
- Pricing: `quantity` integer 0–1,000, `unit_price_cents` integer 0–1,000,000, `volume_discount_bps` integer 0–5,000, `price_includes_discount` boolean, `currency` `USD|EUR`. Discount starts at 100 units. Monetary calculations use integer half-up rounding.
- AP: `subtotal_cents` integer 0–10,000,000, `tax_cents` integer 0–2,000,000; `submitter`, `approver_one`, `approver_two` each one of `employee-a,employee-b,manager-a,manager-b,finance-a,finance-b`. Only manager/finance identities are eligible. Threshold is 1,000,000 cents; routing requires one or two distinct eligible non-submitter identities. These are synthetic labels, not real authentication.
- Permissions: `authenticated`, `role_allow`, `explicit_deny` booleans; `subject_tenant` and `resource_tenant` `acme|globex`; `action` `read|write|delete|unknown`. `unknown` represents the explicitly denied unknown-action class. Outputs list protected field names only; no real protected values exist in these fixtures.

## Bounded execution and standalone bundle

`backend/runner/suite_batch.py` is a fixed reviewed entry point. It resolves only known scenario/variant IDs, rechecks source hashes, and evaluates each reviewed pure function with validated case data. Each variant runs in an isolated Python subprocess with the existing environment allowlist, a 15-second batch wall timeout, and a 1 MiB output cap. Comparison uses two batches; validation one. A failed batch produces execution errors/timeouts, never fabricated per-case successes. Failed-batch duration is the batch wall time, not a measured individual-case duration. The trusted-fixture fallback still lacks Docker network/filesystem/CPU/memory isolation.

The standalone bundle includes source hashes, exact `corpus.json` bytes and dataset metadata, decision/evidence/results JSON, approved cases, baseline/candidate sources, and fixed templates. `python -I acceptance_tests.py` checks the candidate against exactly the approved cases. The separate `python -I requirement_tests.py` checks mandatory requirements against **both** implementations over the pinned corpus. A known baseline or shared defect may fail that second command even when candidate acceptance succeeds. The bundle contains no provider/database credentials and requires no application services.

Neither standalone command has been run for this expansion. The four normal comparison runs completed through the UI. Batch failure controls, approval/version safety, export reproduction, and broader UI behavior still await the deferred checks.


Comparison requests may now select optional `baseline` and `candidate` IDs from that scenario's reviewed variants; the two IDs must differ. Validation accepts an optional reviewed `candidate` ID. Defaults preserve the original source pair. Exports use the selected pair saved with the comparison and reject mismatched hashes. This supports the real corrected-version demo comparisons without adding arbitrary-code execution.
