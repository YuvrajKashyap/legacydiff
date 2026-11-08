# Integration evidence and event status

Checked November 8, 2026, approximately 2:13 a.m. America/Chicago (CST). This is a local engineering record and draft submission material, not a submission or sponsor acceptance claim.

## NVIDIA: live account verification

The official NVIDIA examples list these exact provider IDs at `https://integrate.api.nvidia.com/v1`:

| UI choice              | Verified provider identifier             | Account readiness in this build |
| ---------------------- | ---------------------------------------- | ------------------------------- |
| Nemotron 3.5 Super VL  | `nvidia/nemotron-3.5-super-vl-120b-a12b` | Not verified; disabled          |
| Nemotron 3 Ultra       | `nvidia/nemotron-3-ultra-550b-a55b`      | Live tool round trip passed |
| Nemotron 3.5 Lightning | `nvidia/nemotron-3.5-lightning-30b-a3b`  | Not verified; disabled          |

Sources: [Super VL model example](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), [Ultra model example](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b), [Lightning model example](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b).

The initial missing-key check was superseded by authorized account setup. A dedicated 30-day key is stored in ignored `.env`. Ultra passed live tool readiness and a complete four-role investigation (8 calls, 10 tool requests, 81.7 seconds). Earlier partial failures remain recorded. Super returned a different provider ID and was rejected; Lightning did not pass its round trip. See VERIFICATION.md for final live outcomes.

Implemented code in `services/ai/index.ts` contains a server-only fixed-endpoint transport, model registry, two-request tool readiness probe, separate orchestrator/behavior/policy/regression contexts, role-specific validated tools, a global eight-turn budget plus at most one correction, twenty-case ceiling, cancellation, and partial-failure results. The readiness probe validates a tool request, supplies a random result under its exact tool-call ID, and verifies that the subsequent response uses that result. Controlled HTTP tests verify the adapter/controller, not the live service. The NVIDIA documentation describes the request/tool-result sequence used by the adapter. [NVIDIA function calling](https://docs.nvidia.com/nim/large-language-models/1.15.0/function-calling.html).

The worker must keep a model disabled until its live probe succeeds, preserve the selected model throughout the run, and never substitute another model. See `services/ai/README.md` for integration and limits. Enter credentials through the local runtime environment; do not paste them into the UI, chat, `VITE_*` variables, or committed files.

## GitHub: local evidence only until approved publication

The checkout origin is `https://github.com/YuvrajKashyap/legacydiff.git`. A read-only `git ls-remote origin` completed successfully with no refs on this check, consistent with the empty repository cloned at task start. No published commit containing the new fixtures or policy artifacts was available. The unauthenticated repository API was unavailable through the browsing tool, so repository visibility was not independently established.

The app currently uses hash-verified bundled sources labeled **Local fixture**. It must not label them Live or Cached GitHub evidence. `services/ai/evidence.ts` implements an allowlisted Contents API reader that requires a full commit SHA and content SHA256, checks Git blob SHA against returned bytes, records provenance, and only falls back to a matching previously fetched snapshot. These behaviors have controlled-response tests; no live retrieval of this project's unpublished artifacts has succeeded. [GitHub Contents API](https://docs.github.com/en/rest/repos/contents).

The worker path is now wired through `services/worker/evidence-config.ts` and `readCatalog`. With no `GITHUB_EVIDENCE_COMMIT`, it makes no GitHub request. Setting that private environment variable to a full lowercase 40-character commit SHA enables fetching all three reviewed code variants and both policies against their manifest hashes. A missing remote artifact blocks catalog readiness instead of falling back to bundled bytes. Complete snapshots are persisted through `recordArtifact` before catalog readiness; AI reads resolve the frozen run's exact artifact/hash/commit, not the current catalog.

Before live retrieval can be claimed: obtain the user's first-push/publication approval, publish the intended reviewed files, configure the actual resulting `GITHUB_EVIDENCE_COMMIT`, restart the worker, and run a real fetch/citation check. Controlled-response tests verify the wired live/cache/missing-file paths and provenance validation; they are not a live GitHub success. No push, visibility change, public deployment, or permission expansion was performed here.

## Official event information and eligibility limits

The official event site lists November 7–8, 2026, at UT Dallas. Its CT schedule lists the initial Devpost deadline at 11 p.m. November 7 and final submissions due at noon November 8. At this check, the initial deadline had passed; the final deadline was still ahead. Teams may have one to four people and enter up to three tracks. [HackUTD Zero Day schedule and tracks](https://zeroday.hackutd.co/).

| Track                            | Published criterion                                                                             | LegacyDiff assessment                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8090 Legacy System Modernization | Agents/tools that help understand, improve, or replace old software.                            | The measured migration/review/test loop appears relevant. The public summary does not require different source languages; Python-to-Python acceptance remains the sponsor's decision. |
| NVIDIA Nemotron Beyond a Chatbot | Nemotron plus multi-step workflows, external API/tool integration, and practical applicability. | Live Ultra tool calls are proved; sponsor eligibility and full workflow evidence remain subject to the final verification report.                                                                                                    |
| Spacetime Build on Spacetime     | Public GitHub repository and a majority of backend work built on Spacetime.                     | Core state/authorization/reducers use Spacetime; the private runner/provider worker remains separate. Sponsor interpretation and public-repository compliance are unconfirmed.        |

Track criteria source: [official HackUTD challenge statements](https://zeroday.hackutd.co/#tracks). The assessments are engineering interpretations, not eligibility determinations.

The provided [Devpost event URL](https://hackutd-zeroday.devpost.com/), [Devpost rules URL](https://hackutd-zeroday.devpost.com/rules), and [HARP schedule URL](https://harp.hackutd.co/app/schedule) were not accessible through the browsing tool; each returned an internal access/fetch error. The official event site's Devpost link led to the generic Devpost homepage, not a verifiable entry. No logged-in project entry, chosen tracks, teammate roster, initial submission receipt, or submitted status was inspected. These remain unknown. Nothing here confirms late-entry permission or an exception to the published schedule.

## Evidence available for truthful demonstration

Final local results are maintained in [VERIFICATION.md](VERIFICATION.md): 39 TypeScript tests passed (one optional timeout test skipped), 16 real-database tests passed (one optional lease test skipped), and both browser scenarios passed. Separate long timeout/lease runs passed earlier. The final browser tests include real denied-export checks, independent identities and the complete approval/export loop.

`python -m unittest discover -s tests/python -v` passed 18 tests, including actual day-30 execution, inclusive/exclusive decisions, supplied corrected-candidate validation, standalone export execution, tamper detection, timeout/crash/output-limit cleanup, and secret isolation. These are local trusted-fixture checks. Docker isolation and arbitrary hostile-code safety are not established. Full browser-release status belongs in the final verification report; backend/adapter tests alone do not prove the complete two-browser UI flow.

## Draft submission text — not submitted

**LegacyDiff turns a migration difference into a reviewed, executable expectation.** Its synthetic returns example runs the same validated inputs through an old implementation and a rewrite. At day 30, the implementations disagree about eligibility and a $100 refund. Two conflicting policy excerpts make the intended behavior a human decision rather than an automatic vote for the old code.

The local prototype uses Spacetime for shared records, admission, revision checks, and atomic approval. Reviewers can include or exclude the boundary or defer. Approved expectations become fixed-template Python tests, and the downloadable review bundle runs independently of the UI. Tests demonstrate that choosing the inclusive policy makes the original rewrite fail, while the supplied corrected candidate passes.

A bounded NVIDIA orchestrator and three specialists are implemented. Ultra completed a live four-role investigation with eight model calls and ten tool requests. Complete versus partial investigation outcomes are recorded explicitly. Current source and policy evidence is bundled and labeled Local fixture; commit-pinned live GitHub retrieval awaits authorized publication and integration verification. This submission draft describes the verified deterministic prototype and does not claim a completed live AI team, universal migration equivalence, autonomous repairs, sponsor qualification, or an existing submission.

Do not publish this draft without reconciling it with the final build, actual demo evidence, selected tracks, and any newly verified integrations.
