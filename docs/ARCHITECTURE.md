# Ownership and trust boundaries

React renders confirmed application data. `createLegacyDiffClient` owns identity restoration, subscriptions, freshness, reconnects and reducer calls. Presentation code never imports worker code, provider clients or database implementations. `tests/architecture.test.ts` checks the runtime import graph so a future visual rewrite cannot silently cross that boundary.

Spacetime 2.14.1 is the sole application database. A private room row is a bounded transaction aggregate containing runs and immutable proposal/decision histories. Separate indexed membership records authorize its per-user view. This intentionally favors a small local demonstration over a normalized enterprise data model: up to 30 memberships per identity, 10 participants per room, 20 runs per room, 50 proposals and 200 comments per run. Do not claim large-scale performance from this design.

Participant subscriptions expose only rooms authorized by server-recognized identity. Room locators grant no access. Admission requests expose themselves to their requester and the room owner. Only the owner assigns membership; only a reviewer approves. Worker views return nothing to ordinary identities. Presence is connection-aware and expires; it never acts as a lock.

The current run captures source snapshots, fingerprints and evidence bytes. Published proposals freeze choice, rationale, both evidence references and five exact expected cases. Decisions copy the reviewed snapshot and record server-derived reviewer/time. Approval checks current proposal and decision versions and inserts its decision, validation job, activity and receipt in one reducer transaction. Replay is operation/actor/request scoped and rejects changed payloads. An independent comment does not rewrite a proposal.

The trusted worker has a separate identity configured by the local database publisher. It claims one job at a time. External execution happens outside transactions. Commits must match job attempt, lease, decision version and candidate hash. Deterministic leases last 60 seconds; AI leases last 600 seconds. Expired deterministic work can be reclaimed up to three attempts. Uncertain billed AI work is marked error after expiry and is never automatically replayed. Expired cancellation is finalized by recovery.

Python executes only known fixtures after hash checks, with strict input/output validation. The TypeScript worker validates runner JSON again. Model tools accept approved IDs or bounded case data, never paths, commands, arbitrary URLs or approvals. Provider calls are budgeted across all four contexts. The fixed acceptance template loads reviewed JSON; no model or rationale text becomes executable code.

The worker's loopback HTTP endpoint offers health and authenticated export only. Export validates the participant's token through a separate real Spacetime connection and reads its authorized snapshot. It cannot start arbitrary execution. CORS permits only the local frontend origins; it is additional browser protection, not authorization. ZIPs stay under ignored `.local/exports` and contain synthetic source and the selected immutable decision snapshot.

## A normal change

- Visual change: edit `apps/web`, retain `useLegacyDiff()` and typed actions, run type/lint/browser checks.
- Operation/data change: update contracts and backend together, regenerate bindings, update the adapter, then run actual authorization/concurrency tests.
- Fixture change: review the source, refresh the explicit manifest hash, start a new run. Old source snapshots and validation remain visible; never relabel a changed file as the old candidate.
- Provider change: update server-only adapter, validate tool arguments/citations, and run a real readiness probe before enabling it.

## Boundaries that remain local

Display labels are not organizational authentication. The reduced-isolation runner lacks Docker network/filesystem/CPU/memory/process controls. Database signing keys, worker credentials and exports are private local runtime data. Public deployment requires an explicit decision, reachable hosting, abuse controls and a supported execution host. See deployment notes; static frontend hosting alone is insufficient.
