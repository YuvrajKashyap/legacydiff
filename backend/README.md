# Backend

All trusted application behavior lives here. The frontend must not import these modules or receive provider credentials.

| Folder | Responsibility | Start reading |
| --- | --- | --- |
| `database/spacetimedb/src` | Authoritative state, access checks, atomic approvals and job leases | `index.ts`, then `schema.ts`, `access.ts`, and the relevant reducer file |
| `worker` | Private process coordinating jobs, Python and authenticated exports | `main.ts`, then `scenario-jobs.ts` or classic `jobs.ts` |
| `runner` | Reviewed Python fixture execution, comparison and standalone bundles | `cli.py`, then `suites.py` or classic `core.py` |
| `ai` | Bounded model investigation, tools and pinned evidence | `suite-investigation.ts` or classic `index.ts` |

## Follow a comparison

1. The browser client calls `startSuite` in `database/spacetimedb/src/scenarios.ts`.
2. The database freezes the catalog snapshot and queues a private job.
3. `worker/main.ts` leases it; `worker/scenario-jobs.ts` calls the reviewed runner.
4. The runner compares actual baseline/candidate outputs and evaluates independent requirements.
5. The database validates and stores the result; subscriptions update the frontend.
6. A reviewer publishes and explicitly approves a revision. Only then is acceptance validation queued.

The classic returns flow remains in `reviews.ts`, database `worker.ts`, worker `jobs.ts`, and runner `core.py`/`export.py` to preserve existing records and behavior. These are compatibility paths, not duplicate applications.

Run commands from the repository root. `npm run browse` starts the local workspace. Root `.env` and `.local` remain private runtime inputs; moving source code does not move or reset saved data. See [architecture](../docs/ARCHITECTURE.md) for trust boundaries and [runner controls](runner/README.md) for the reduced-isolation local runner.
