# Deterministic runner

Only the three reviewed synthetic variants in `fixtures/returns/manifest.json` are executable. Artifact IDs resolve on the trusted worker; browser/model requests cannot supply paths, commands, code, or dependencies. Hashes are checked before every fixture run. Python 3.11+ standard library is sufficient.

This implementation uses the **trusted-fixture local fallback** because the available Docker client had no running daemon. It runs `python -I -B` with a small environment allowlist, three-second wall timeout, 64 KiB cap per output stream, and cancellation cleanup. It does **not** provide Docker filesystem, network, CPU, memory, or process-count isolation. Keep the worker local/private. Do not use this runner for uploaded, fetched, or generated code.

## Worker interface

From the repository root run `python -m backend.runner.cli`, send exactly one JSON request on stdin and close stdin. Stdout contains one JSON result. Exit 0 means the operation completed (a policy validation may still have `state: "fail"`); exit 1 returns a sanitized error object.

- `{"op":"manifest"}`: pinned variants/source previews, evidence with `Local fixture` provenance, five initial cases, runner mode.
- `{"op":"compare","baseline":"legacy-v1","candidate":"rewrite-v2"}`: actual measured comparison. Optional `cases` contains 1â€“20 `{id,input}` records. Only legacy-v1 â†’ rewrite-v2 and legacy-v1 â†’ corrected-v2 are supported pairs.
- `{"op":"validate","variant":"rewrite-v2","approved_cases":[...]}`: each approved case contains `{id,input,expected}`. The trusted worker must call this only from a committed, version-bound approval job. The runner is not the authorization authority.
- `{"op":"export","snapshot":{...},"output_dir":"<new private worker directory>"}`: writes a standalone directory and sibling ZIP. The path is configured by the trusted worker, never accepted from a browser/model. Existing output directories are rejected.

The export snapshot has exactly `decision`, `approved_cases`, `candidate`, `evidence`, `run_results`. The decision has exactly `version` (positive integer), `proposal_revision` (positive integer), `reviewer`, `rationale`, `choice` (`include` or `exclude`), `approved_at`. Evidence must contain both pinned policy artifacts with matching ID/hash/source bytes. The caller must assemble these from one consistent authorized persisted version. No `defer` export is accepted.

`validate` reports each expected and actual output, execution status and duration. It does not create expectations or interpret policy. Execution errors differ from policy assertion failures. Both crashing variants produce an error, not a match.

## Export

The fixed `acceptance_template.py` is copied byte-for-byte to `acceptance_tests.py`; all approved expectations stay in JSON. User/model strings never become executable Python. The standalone bundle includes hashes, candidate source, decision/evidence/measurement JSON and README. Run `python -I acceptance_tests.py` inside the extracted bundle. An inclusion decision against rewrite-v2 exits 1 with the measured day-30 assertion failure. The supplied corrected candidate passes the inclusion decision. The reverse policy can pass rewrite-v2 and fail legacy-v1.

## Verification

`python -m unittest discover -s tests/python -v`

Tests use actual Python subprocess execution and an actual exported bundle in a clean temporary directory. They exercise strict contracts, typed comparison, allowlist/hash rejection, crash/timeout/output-cap/cancellation, two-crash classification, include/exclude, and CLI validation. Temporary trusted test programs exercise process failure controls; they are not available through the production variant registry. No Docker isolation or public execution claim is made.


## Additive scenario suites (authored, not yet verified)

The original operations above remain the returns compatibility path. `suite_manifest`, `suite_compare`, `suite_validate`, and `suite_export` add returns, pricing, accounts-payable, and permissions with 96 generated inputs each. See [the suite contract](../../fixtures/SUITES.md) for exact schemas, mandatory independent requirements, bounded batch execution, and deferred verification status. The user later authorized four real comparison runs, which completed locally. Full verification and standalone export checks remain deferred; see the root verification report.
