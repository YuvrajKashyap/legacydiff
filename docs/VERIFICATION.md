# Verification evidence

Checkpoint: November 8, 2026. Scope: reviewed synthetic returns fixtures, local Windows services, and a staged private Spacetime database. This is not a security certification or a production-readiness claim.

## Commands and outcomes

| Check | Actual outcome |
| --- | --- |
| `npm test` | 39 passed, zero failed, one optional 45-second timeout test skipped in the latest default run |
| `npm run test:python` | 18 passed, zero failed; real subprocesses and standalone exports |
| `npm run test:integration` | 16 passed, zero failed, one optional real-lease test skipped in the latest default run against local Spacetime |
| Long worker timeout check | Earlier explicit run passed all 5 worker-runner tests, including process-tree timeout cleanup before the 60-second lease |
| Real lease-expiry check | Earlier explicit run passed all 10 then-current integration checks including expiry, reclaim, old-attempt denial and cancelled recovery |
| `npm run test:e2e` | Both independent-context scenarios passed in 15.4 seconds on the final integrated code after waiting for the single live worker to become idle. An overlapping run had timed out in the queue and is not counted as a pass. |
| `npm run lint`, `npm run typecheck`, `npm run format:check` | Passed on the final integrated provider and UI changes |
| `npm run build` | Vite and Spacetime module builds passed; known Zod circular-dependency warning, no build failure |
| `npm audit` | Zero vulnerabilities in the recorded full dependency audit, including development dependencies; `.local/npm-audit-final.json` |

Tests use separate identities, real subscriptions/reducers and actual Python execution. Provider unit tests use controlled transports and are not counted as live NVIDIA proof.

## Required behavior covered

- Measured day-30 difference and matching controls; strict input/output schemas, exact type-sensitive comparison, missing/null and array order. Two crashes are errors, never a match.
- Hash mismatch, timeout, crash, output cap, cancellation, process cleanup and absence of environment secrets in the fixture/export.
- Direct export requests with missing credentials or an unauthorized identity return 403 and only the exact generic denial, with no protected content. Denied third-party room reads and mutations; owner-only admission; role checks; worker-only result publication; forged output/hash/verdict rejection.
- Duplicate request replay and changed-payload rejection; concurrent comments, proposal conflicts, stale approval, racing approvals and exactly one committed validation.
- Include fails the original rewrite; Exclude passes it; Include passes the separately supplied corrected variant. Defer creates no approved tests. Old validations stay with their original immutable decision.
- Reconnect restores confirmed state without replaying work; independent navigation/drafts, stale-preview rationale retention, keyboard dialog behavior and narrow layout.
- Unknown/unauthorized tools, instruction-like evidence, invalid schema/citations, bounded cases/calls, cancellation and unavailable models fail honestly. One correction budget is shared across specialists and synthesis.
- Presentation regression: execution errors cannot receive a no-differences conclusion. Matching outputs do not establish correctness or security. Acceptance tests name their origin as approved returns policy.

These security/concurrency checks test LegacyDiff's supported trust boundaries. They do not evaluate arbitrary customer software, cross-language equivalence, stateful adapters, load capacity or broad vulnerability coverage.

## Standalone export

The browser-downloaded `test-results/e2e-two-independent-identi-daaf1-preview-validate-and-export/review-bundle.zip` was extracted into a fresh directory under `.local/e2e-export-checks`. `python -I acceptance_tests.py` executed five approved cases. Exit 1 was the expected day-30 policy assertion failure for Include against the original rewrite, with no execution error. `.local/e2e-export-checks/latest-result.json` records the location and result. Python tests independently verify tamper detection, crashes and the supplied corrected candidate.

## Live integrations and remaining gates

- NVIDIA: dedicated `LegacyDiff-local-worker` key created with explicit authorization, expires December 8, 2026. Stored only in ignored `.env`; never in frontend configuration. Ultra passed a real two-call tool-result nonce proof. Super returned `private/nvidia/nemotron-3.5-super-120b-a12b` instead of the requested public ID and remains disabled; no alias/substitution is silently accepted. Lightning failed its readiness round trip and remains disabled unless a later session verifies it.
- Actual Ultra investigations ran through the worker and saved results in Spacetime. Early runs were partial, including rejected invalid citations. This led to numbered source lines, a tested single correction step, and a synthesis tool schema restricted to exact validated policy citations. A complete live run then finished all four roles: **8 calls, 0 corrections, 10 tool requests, 5 distinct cases, 81,696 ms**, requested and actual model both `nvidia/nemotron-3-ultra-550b-a55b`. See [credential-free measured evidence](evidence/live-nvidia-2026-11-08.json). A second live run started and inspected in the in-app browser also completed all four roles: 8 calls, 0 corrections, 14 tool requests, 41.2 seconds. Its actual states, citations and unapproved suggestions rendered at desktop and 390px without horizontal overflow. These are successful samples, not a claim that every future model response succeeds.
- Spacetime: local database `legacydiff-local-v2` is the active demo backend. User authorized hosted account setup; private `legacydiff-dev-v5iw5` has the actual module installed and owner configuration verified. The dashboard showed 9 tables and 21 reducers while running. It is paused, with no hosted worker or public frontend connected. Hosted CLI authentication is isolated in ignored `.local/hosted-cli.toml`.
- Hosted initialization note: the dashboard created a placeholder module. Its update did not run the new init reducer. All nine tables were individually verified to contain zero rows before a one-time initialization of this newly created empty development database. No local database, user history or production records were cleared. Startup/publish scripts contain no destructive reset flags.
- GitHub evidence: allowlisted, hash-verified adapter and matching-cache failure behavior are tested; actual public commit retrieval remains blocked by the unapproved first push. Evidence is honestly labeled Local fixture.
- Docker: engine unavailable. Execution remains the reviewed trusted-fixture local fallback, not an arbitrary-code sandbox. No remotely reachable worker execution service has been deployed.
- No GitHub push, public app deployment, paid provisioning or hackathon submission. Sponsor eligibility, entry and selected tracks are unverified.

## Product-context checkpoint

The modernization guide was accessible and read. Changes were limited to truthful result language, test-origin wording, an execution-error presentation regression test, and [six documented proposals](FIXTURE_BACKLOG.md). No additional scenario, schema redesign, scanner, arbitrary execution or automatic repair was implemented. Independent requirement findings for future customer fixtures are a documented gap, not a fabricated green state.

Final release checks also verified the actual NVIDIA key was absent from all staged files, the production frontend and the downloaded ZIP. All five staged fixture hashes match the manifest; Git enforces LF line endings. Local documentation links resolve. The final frontend is replaceable through the documented client contract; architecture tests prohibit server/worker/business-policy imports into the browser.

## Visual refinement checkpoint — November 8, 2026

Presentation-only refinement raises small supporting text to 12px, makes measured output values more prominent, aligns specialist status cards, improves long-title wrapping, and adds 44px mobile controls and 16px mobile text inputs. Existing frontend/backend boundaries remain unchanged.

Inspected the actual saved live investigation, finding/evidence review and setup dialog in the in-app browser at desktop and 390px mobile width. Mobile document width remained within the viewport. Fresh checks: 39 TypeScript tests passed, one optional timeout test skipped; both browser workflows passed (15.6 seconds), including stale approvals, denied exports, mobile keyboard review and runnable export. Typecheck, lint, formatting and production/module builds passed. The existing Zod circular-dependency build warning remains. Backend/Python integration suites were not repeated for these CSS-only changes; their previous results above remain separate evidence.
