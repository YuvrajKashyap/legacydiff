# Python runner verification

Verified locally on November 8, 2026 using Windows and Python 3.11. The latest full run completed **22 tests with zero failures or errors** in 79.119 seconds. This timing describes this test run, not a performance claim.

Commands from the repository root:

```powershell
python -m unittest discover -s tests/python -v
.\.local\python-tools\bin\ruff.exe format --check backend/runner tests/python fixtures/returns
.\.local\python-tools\bin\ruff.exe check backend/runner tests/python fixtures/returns
```

Ruff 0.17.4 reported 14 files already formatted and all lint checks passed. Install the pinned development tool locally with `python -m pip install --target .local/python-tools -r backend/runner/requirements-dev.txt`. Runtime execution needs no pip packages.

## Passed behaviors

- Real legacy/rewrite subprocesses produced the day-30 eligibility, reason, and refund differences; the other initial controls matched.
- Inputs reject unknown fields, boolean integers, float money, out-of-range values, invalid booleans, and NaN. Output validation rejects invalid types, inconsistent refunds, and unknown reasons.
- Comparison ignores object-key order and distinguishes missing/null, booleans/numbers, and array order. Two actual crashing test fixtures produce an error rather than a successful match.
- Identical/unknown source pairs and changed fixture bytes are rejected before production fixture execution.
- Controlled process tests verify crash classification, bounded captured output, timeout, and cancellation status. Timeout cleanup additionally inspects the real child process and confirms it has exited and all three streams are closed.
- Include-day-30 validation fails rewrite-v2 and passes the supplied corrected-v2. Exclude-day-30 passes rewrite-v2 and fails legacy-v1. Actual outputs remain attached to every case.
- Export refuses absent approval metadata. The original rewrite bundle runs independently and produces the expected day-30 assertion failure. The corrected bundle independently exits successfully.
- Every exported file except the manifest itself has a SHA256 entry. A separate mutation of each hashed file causes the standalone command to reject bundle integrity before fixture execution.
- Execution crashes are errors in both worker validation and the standalone unittest; they are not policy assertion failures. The standalone regression test failed before this correction and passed afterward.
- A synthetic `NVIDIA_API_KEY` environment sentinel does not reach a child process or any ZIP member; an adjacent `.env` is not included. This verifies the environment/file-copy boundary, not a universal secret detector.
- CLI operations reject unknown fields/operations and produce a real measured comparison.

## Limits and untested controls

- This is explicitly the trusted-fixture local fallback. Docker was unavailable at initial environment inspection. Docker non-root/read-only/network/capability/seccomp/CPU/memory/process controls are **not implemented or verified** here.
- Only reviewed bundled fixtures are supported. Controlled crash/timeout/output tests call the internal process primitive or a temporary test-only fixture registry. Those programs are not accessible through the production CLI variant IDs.
- Tests confirm termination of the direct child process, not a hostile descendant process tree. The reviewed fixtures do not spawn descendants. This runner must never be exposed as arbitrary-code execution.
- Cancellation cleanup is tested at the runner primitive; cancellation propagation from the application worker and job lease semantics belong to integration tests outside this directory.
- The backend must authorize approval and assemble a consistent immutable snapshot. The runner validates that snapshot's shape and pinned evidence bytes; local CLI possession is not authentication. Room access, concurrent approvals, job recovery, provider calls, and browser behavior are not proven by this suite.
- Hashes detect changed bundle contents relative to its manifest, not a malicious party rewriting both contents and manifest. The manifest is not signed. Source-review and artifact provenance remain separate controls.
- User-authored rationale is exported intentionally. The runner does not claim it can identify secrets a user places in that text.
- Test bundles are created in clean temporary directories and removed afterward; they are verification artifacts, not a real user's approved decision export.

## Four-scenario expansion checks

The authorized November 8 end-to-end pass adds `test_scenarios.py`. It executes all four 96-input corpora with the reviewed Python subprocess runner. Default-pair measured mismatch counts are returns 3, pricing 30, accounts payable 56, and permissions 15; every scenario reported zero execution errors. Returns legacy/corrected reports zero differences across 96 inputs, while legacy/rewrite reports exactly three.

The new coverage checks a permissions requirement that fails in both implementations even where outputs match; rejects altered policy expectations and unknown/identical source pairs; validates corrected candidates under each scenario's first authored policy; and creates standalone bundles in temporary directories only. Each bundle's source selection, dataset bytes, complete file hashes, candidate acceptance command, and independent requirements command are checked. The independent commands intentionally report assertion failures for known accounts-payable and permissions baseline defects; they are not execution errors. Modified candidate files are rejected by the exported integrity check. A mismatched validation candidate hash is rejected at export.

No saved user rooms, approvals, or review histories are modified by these tests. This verifies reviewed synthetic programs and temporary exports, not arbitrary-code isolation, hosted deployment, live provider behavior, or browser collaboration. Ruff lint and formatting checks pass for `backend/runner` and `tests/python` (19 formatted files).
