# Verification evidence

Checkpoint: November 8, 2026. Scope: reviewed synthetic returns fixtures, local Windows services, and a staged private Spacetime database. This is not a security certification or a production-readiness claim.

The commands and results below are historical checkpoints for the earlier returns implementation. They do not verify the later four-scenario expansion described at the end of this document.

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

## Local side-by-side previews — November 8, 2026

Replaced Vercel source setup with isolated Main (5175/3010/3011) and Working (5174/3000/3001) services. A managed detached worktree owns Main's database, keys, worker token and exports. Existing Working history and services were preserved. Provider credentials were not copied. The Vercel connector requires owner confirmation to delete the temporary remote project; deletion is not claimed.

Fresh verification: 40 TypeScript tests passed, one optional timeout test skipped; typecheck, lint, formatting and production/module builds passed. Both end-to-end browser tests passed separately against Main (17.0s) and Working (16.6s), covering real comparison, collaboration, stale approval, validation, export and denied export access. Main and Working public signing keys differ. First startup, repeated startup and owned-process stop/restart were exercised without data deletion. The existing Zod circular-dependency warning remains. Python and database reducer integration suites were not separately repeated; the end-to-end suites exercised both real local databases/workers.

## Four-scenario Working implementation — November 8, 2026 (unverified)

Working source now includes returns, pricing, accounts payable and permissions through shared scenario contracts, client actions and dedicated presentation components. The UI keeps measured execution, independent requirements, proposed expectations and approved acceptance results separate. Source/evidence hashes and line ranges come from the frozen run manifest; case filters and pagination do not manufacture results. Approval captures proposal revision and decision version, disables stale/disconnected previews and prevents reapproving an already-decided revision. Export remains disabled until that decision has a recorded validation result, including a genuine failing result.

A static integration review corrected duplicate approval controls, model selection when the catalog arrives asynchronously, reducer text limits, and exact run navigation. Missing AI/validation output is explicitly described as unrecorded rather than successful or necessarily still running. These are source-level changes, not runtime verification.

Per the user's instruction, no tests, typecheck, build, lint or browser checks were run for this expansion. Formatting edits are not verification. The four-scenario flow, live AI integration, concurrency, reload/reconnect behavior, acceptance execution and downloaded bundles still require a new authorized verification pass. No commit or push was made for this iteration.

The earlier isolated Main/Working preview checkpoint above is historical. The current preview arrangement is intended to expose pinned Main code at `/main/` and Working code at `/` on the same local origin, sharing workspace data and authentication. Activation is owned by the local launcher; this UI pass did not verify that runtime arrangement or modify Main source.


## User-authorized corpus population — November 8, 2026

Created one real deterministic comparison through Working's UI for each of returns, pricing, accounts payable and permissions, using the existing browser identity and normal authorized reducers. Each selected corpus contains 96 inputs (384 total). All four persisted runs reached completed and appeared alongside the preserved original returns investigation in All comparisons (5 rows). No approvals were published and no AI investigations were requested for these four runs.

Run IDs: returns `suite-711bcf26-ffe4-4839-93b7-9c25f72ed547`; pricing `suite-797e6dcf-3967-4099-9c17-5ed89e523884`; accounts payable `suite-e339fa61-f867-448a-a7c9-55ca0593c83b`; permissions `suite-1eefeccd-76f2-4fc2-b12f-df65c654f6f3`.

This is evidence of these actual local comparison executions and visible saved rows, not full verification of the new approval, concurrency, AI or export paths. Full test suites remain explicitly deferred. No commit or push.


## Source organization activation — November 8, 2026

Moved `apps/web` to `frontend`, `services` to `backend`, and `spacetime` to `backend/database`. Updated source imports, startup scripts, Python module paths, configuration, existing test references and contributor guides. Added plain-language code comments and repository-scoped Explorer exclusions for runtime/generated clutter. No runtime data was deleted.

Necessary local database compilation and binding generation completed from the new path. Publication reported no schema changes. Both preview servers and the worker started; opening Working showed all five saved comparison rows and AI ready. No new corpus execution, full test suite, lint, separate typecheck, approval/export rehearsal or push was performed during this reorganization. Existing observed executions above remain historical evidence, not a full regression result for this layout.


## Ten-comparison demo population — November 8, 2026

User requested 10 real saved comparisons, 4 needing review, 0 approved history. Added five actual 96-input comparisons through the normal UI: legacy versus supplied corrected for returns, pricing, accounts payable and permissions; plus permissions rewrite versus supplied corrected to isolate the remaining tenant defect. Their measured differing-case counts were 0, 0, 56, 18 and 3 respectively. These reuse the four authored corpora across reviewed source pairs, not new invented customer data or fabricated results.

Selected source IDs are restricted to the scenario's bundled manifest and frozen with each run. Runner comparison, validation and export now carry that selected pair. Old default pairs remain unchanged. Independent requirements remain separately reported; requirements display is paginated with failures/errors first.

The five supporting runs and the original classic returns rehearsal were explicitly deferred, not approved or marked resolved. The four original full-corpus rewrite comparisons remain active. UI observed All comparisons 10 / Needs review 4 / History 0. Queue now correctly excludes deferred records while keeping them in All comparisons; no decision history was created. Security failures are not waived by deferral.

Only requested comparison executions, startup compilation and visible population were performed. Full test suite, selected-variant approval/export regression checks and broader verification remain deferred. No push.


## Review outcome clarity and clean featured example — November 8, 2026

Removed completed/compared as list success signals. Lists now show actual differing-input counts with denominators, execution problems and independent checks unmet on either version; review state remains separate. Classic runs without independent-check data say so. Requirement failures are labeled unmet requirements, separately from crashes/timeouts/invalid execution outputs.

Per user request, deferred the original full-corpus returns rewrite and returned the existing supplied-correction returns comparison to active review through the UI. Added a guarded resume operation for unapproved deferred suite runs; measured results stay unchanged. The queue includes measured comparisons needing human sign-off even when outputs match. Observed counts remain 10 comparisons / 4 review / 0 history. Featured pairs: returns legacy/corrected 0 of96 differences with192 independent checks passing on both sides; pricing legacy/rewrite30 of96; accounts payable legacy/rewrite56 of96; permissions legacy/rewrite15 of96. Permissions displayed baseline44 unmet requirement checks, candidate6, with0 execution problems. These are per-input requirement checks, not distinct bug counts.

No approvals, new test-suite execution or pushes. The startup compile/generation completed and the revised queue was observed in the local app. Approval/export/concurrency regression validation remains deferred.

## Local Demo, Lab and case-chat checkpoint

Added a dedicated Demo route with seven illustrative team-workflow stages and links to actual saved comparison/Lab screens. Real tickets show actual membership/presence separately. Review includes expandable specialist summaries and a combined conclusion; Lab exposes recorded model/tool/handoff events. The browser showed the Demo navigation, staged handoff, and unchanged 10 comparisons / 4 needing review / 0 history.

The local database module compiled/published without data deletion and client bindings were generated to serve contextual chat. A real Ultra question on the permissions ticket was queued and executed; its answer was rejected because a quote did not match the claimed saved source lines. That failure remains visible, not a successful answer. Earlier suite investigations also retain failed/partial roles. Citation presentation and specialist final-summary handling are being corrected; no claim of end-to-end AI success follows from these failures.

No automated tests, lint, separate typecheck, commit, push, remote deployment, approvals or exports were performed in this checkpoint. Browser observations and necessary development compilation do not replace the deferred regression/security/concurrency checks.

Follow-up live evidence: the invoice investigation completed all three specialist roles in eight total model calls, but synthesis was rejected for using a non-policy citation. Its result is retained as partial. Citation tools now offer exact server-generated quote IDs, and proposal citations are restricted to policy-evidence IDs in both tool schemas and parsing. A subsequent permissions chat response saved with eight validated citations but contained only an introductory sentence; generation now requires a complete answer of at least 80 characters. These fixes are not evidence of a complete new run until a subsequent actual result is recorded.

The clean returns comparison subsequently completed all four Ultra roles and its final advisory proposal in eight model calls. This verifies the team trace and saved summaries, not the truth of every model claim: its synthesis incorrectly inferred missing day-30 coverage. Full-corpus input coverage metadata and explicit instructions now tell the model not to use a small inspected subset as proof of missing coverage. That prompt change has not been exercised by another complete investigation.

A Lightning chat answer was saved with valid citations but incorrectly equated mismatches with execution problems. Chat now includes authoritative metric definitions and exact measured totals, and the UI explicitly identifies responses as fallible AI analysis. Earlier inaccurate answers remain historical model outputs rather than being silently rewritten. These observed semantic issues remain part of the deferred verification scope.

Final live chat observation: after restarting with explicit definitions, Lightning saved a correction that accurately distinguished 0 execution problems, 15 differing inputs, 6 unmet candidate checks and 44 unmet baseline checks. The UI displayed the complete answer with provenance controls. This single corrected response does not establish general model accuracy. All work remains local; automated checks and pushes remain deferred.

## End-to-end recovery verification — November 8

The user's failed-investigation screenshot explicitly reopened local verification. Automatic tests are now authorized; no push or public deployment is authorized. Investigation reruns are deliberate user actions, use distinct job IDs, reject overlapping work and stale commits, preserve earlier outcomes/traces, and are capped at five attempts per ticket. Current findings are not silently replaced by an older successful attempt. Specialist gathering now forces the correct measured-case/evidence tool instead of asking for an optional call and subsequently requiring one.

Completed checks in this pass:
- TypeScript typecheck and production frontend/database builds passed. The known Zod circular dependency and frontend chunk-size warnings remain warnings.
- TypeScript tests: 47 passed, one optional timeout skipped in the default run; that timeout was separately enabled and passed with real process cleanup.
- Python: all 22 tests passed, including four 96-input scenarios, corrected candidates, shared defects, standalone exports and tamper rejection. Ruff and Python formatting passed.
- Live isolated Spacetime: 16 standard integration checks passed; the real lease-expiry check separately passed; the new suite retry/chat authorization and stale-attempt integration check passed. An initial isolated module was stale and lacked structuredClone support; republishing the scalar-copy fix resolved it. A regression test runs with structuredClone absent.
- In-app browser on isolated ports 5176/3012/3013: created original and corrected returns comparisons, published exact proposals, approved revisions, observed 3 unmet expectations versus 96/96 met, and downloaded both ZIPs. The original export reproduced exactly three day-30 assertion failures (not execution errors); its independent checks passed. Both commands passed for the corrected export.
- A second in-app browser origin (localhost instead of 127.0.0.1) created an independent identity. It could not read before owner admission, then saw shared data/presence and posted a comment visible immediately to the owner. An owner revision change invalidated its open approval preview and disabled approval. Browser error logs were empty.
- Anonymous export returned 403 with generic denial only. A 390px browser check exposed five-tab navigation overflow; wrapping the navigation removed it (document width equals viewport width).

The isolated verification database has its own data directory at .local/verification-spacetime-data on port 3012. Database integration tests require LEGACYDIFF_DB_PORT=3012 and no concurrently consuming worker; use the normal local module publication command with server http://127.0.0.1:3012. The UI proof uses a separately started worker on 3013 and frontend on 5176. Demo approvals/history were not changed. The old Playwright classic-only suite was not run in an external browser; the current UI flow was exercised in Codex's own in-app browser instead.

Live recovery outcomes for the four demo tickets are recorded below when each actual provider attempt finishes. Passing controlled provider tests establishes protocol handling, not truth of every model statement or uninterrupted NVIDIA availability.

Additional final checks: both independent browser clients had no console errors. Stale approval was disabled visibly while its exact revision remained in the preview. The corrected browser-downloaded export passed acceptance and independent requirements even after the live proposal advanced, proving export stayed bound to the original approved decision. Test services on ports5176/3013/3012 were stopped after inspection; their isolated data was retained. Added provider diagnostics expose only transport-authored timeout/rate-limit/access messages, never arbitrary caught error text; its targeted test passed. Final lint passed. No external browser, push, commit, deployment or demo approval was performed.

Final live outcomes: permissions attempt4 (Lightning), pricing attempt3 (Ultra), invoice approval attempt2 (Lightning), and clean returns attempt3 (Ultra) all reached completed with all three specialists plus orchestrator completed. Permissions was reopened in the actual review screen: AI findings completed, all four expandable summaries completed, and three earlier investigations preserved. Demo counts remained10 comparisons /4 needingreview /0history. The final permissions attempt ran through the same authorized claim/execution path in a temporary one-job helper alongside the independent returns job; no automatic retry or fabricated completion was used. Model conclusions remain advisory and must be checked against measurements/evidence.

## November 8 release verification
User reopened full verification and authorized branch push/merge. Fresh results: 50 TypeScript tests passed (one optional timeout skipped in default run, separately enabled and all five worker-runner checks passed); 22 Python tests passed; 22 live isolated database checks passed including real lease expiry, atomic draft approvals, stale/unauthorized rejection, idempotent replay, racing approvals and ticket message isolation. TypeScript typecheck, ESLint, Prettier, Python Ruff lint/format, production frontend/database build passed. Production dependency audit reports zero vulnerabilities. Build warnings remain for Zod circular dependency and the frontend bundle size.
Review fixed selected-version URLs, editing an already approved policy, preserving chat drafts while sending, and obsolete structured AI test fixtures/retry-cap assertions. In Codex in-app browser against isolated ports5176/3012/3013: selected corrected-v2 from rewrite-v2 and confirmed URL/approval target changed; approved a new exact policy decision atomically; all96 acceptance cases passed. A distinct admitted reviewer origin saw the Team chat message and approved decision. Both browser error logs empty. Demo decisions unchanged. The classic external-browser Playwright suite was not invoked; current workflow was exercised in-app instead.
Live NVIDIA responses were generated earlier in this release iteration, not rerun by CI. Availability/latency and factual correctness of model prose remain provider/advisory limitations; deterministic measurements and requirement checks remain authoritative. No public deployment is included.

