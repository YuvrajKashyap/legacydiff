# LegacyDiff

Turn a measured migration difference into a shared human decision and an executable acceptance test.

The synthetic returns example executes a legacy implementation (`<= 30 days`) and a rewrite (`< 30 days`) against the same validated inputs. Two independent reviewers can discuss conflicting policy evidence, publish immutable proposal revisions, approve an exact revision, and observe the resulting real test failure or pass. The supplied corrected candidate is a separate immutable fixture, not an AI-generated repair.

## Side-by-side browsing

Run `npm run browse` for Main and Working tabs; use `npm run browse:refresh` after merging to main. See [local previews](docs/LOCAL_PREVIEWS.md) for first-time worktree registration, shared workspace data and stop commands.

## Local startup (Windows)

Requirements: Python 3.11+, npm, and Node. This checkout pins a project-local Node 24.22.1 executable for npm scripts and Spacetime CLI/server/SDK 2.14.1. The host Node 24.12 may emit an engine warning during installation; `npm exec -- node --version` must report 24.22.1 afterward. No account or paid service is needed for the deterministic flow.

From the repository root:

```powershell
powershell -File scripts/setup-local.ps1
```

Start these in order, using separate terminals for long-running processes:

```powershell
# Terminal 1: persistent local database, bound to loopback only
powershell -File scripts/start-database.ps1

# Terminal 2: publish to that LOCAL database and generate bindings
powershell -File scripts/publish-local.ps1
# Keep the private worker running
npm run worker

# Terminal 3: frontend
npm run dev
```

Open [the local app](http://127.0.0.1:5174). Worker health is [localhost:3001/health](http://127.0.0.1:3001/health). The worker bootstraps a separate identity using the existing local CLI publisher identity. Its token and database signing keys stay under ignored `.local/`; keep that directory private. Reuse it to preserve local identities/history. Do not clear database data to solve a migration conflict.

The first prototype database (`legacydiff-local`) was retained after a schema change; the current app uses `legacydiff-local-v2`. Both are local only.

## Two-person demonstration

1. Open the app in a normal browser profile. Start with the returns example and select **Run comparison without AI**. Both source files actually execute; day 30 differs by eligibility, refund, and reason.
2. Copy **Share review room**. Open it in a second browser profile or private window, which gets a distinct Spacetime identity. Request admission with a label. In the owner's window, admit it as a reviewer. A label is not verified organizational identity.
3. Publish an Include day 30 proposal with a rationale and both policy sources. The second participant can add a comment or pin evidence; confirmed changes appear in both windows.
4. Open approval in B, publish a revised proposal in A, and observe the stale preview in B. Review the latest revision explicitly before approval. Local drafts survive.
5. Approve and run tests. Original rewrite fails day 30. Exclude day 30 is a separate explicit policy option and can pass the rewrite. Defer creates no approved tests.
6. Download the review ZIP after validation. Extract and run `python -I acceptance_tests.py`. A policy failure is the expected result for Include against the original rewrite; process exit 1 is not an export error.
7. Run the supplied corrected candidate separately; preserve the original run/history. No differences means only no differences in the tested cases.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run test:python
npm run build
npm run test:e2e
```

Database integration tests manually control worker claims. Stop the automatic worker first; keep the database running:

```powershell
npm run test:integration
$env:LEGACYDIFF_LEASE_TEST='1'
npm run test:integration  # includes a real 60-second lease expiry
Remove-Item Env:LEGACYDIFF_LEASE_TEST
# Restart npm run worker before browser tests
```

`npm run test:e2e` requires the frontend, database, and worker already running. It uses independent browser contexts. Install the Playwright Chromium runtime if it is missing: `npx playwright install chromium`.

For Python formatting/lint, the optional pinned Ruff dependency is in `backend/runner/requirements-dev.txt`. TypeScript formatting uses `npm run format` / `npm run format:check`. Runtime dependency auditing: `npm audit --omit=dev`.

## Developer map

Start with `frontend/` for screens and `backend/` for all trusted behavior. `packages/` contains the shared integration boundary. Read the [frontend guide](frontend/README.md), [backend guide](backend/README.md), or [shared contract guide](packages/README.md) for a short reading order.

```text
frontend/    React screens, components and styles
backend/     Database rules, worker, AI and Python execution
packages/    Browser client and shared contracts
fixtures/    Authored synthetic inputs, source pairs and evidence
tests/       Verification suites (deferred during current iteration)
scripts/     Local startup and developer commands
docs/        Requirements, architecture and recorded evidence
```

VS Code hides dependency folders, build output, caches and `.local` runtime data through repository settings. Those files still exist; nothing is deleted. Generated client bindings remain labeled under `packages/client/generated`.


| Location | Responsibility |
| --- | --- |
| `frontend` | Replaceable React presentation, navigation, local drafts |
| `packages/client` | Identity, authenticated subscriptions, readiness, typed actions; generated bindings isolated |
| `packages/contracts` | UI DTOs, strict JSON schemas, reviewed expectation scope, wire conversions |
| `backend/database/spacetimedb/src` | Authoritative rooms, membership, atomic approvals, receipts, leased jobs |
| `backend/worker` | Private job execution, runner/provider integration, authenticated ZIP export |
| `backend/ai` | Bounded four-role controller, NVIDIA adapter, pinned GitHub evidence retrieval |
| `backend/runner` | Strict Python boundary, reviewed subprocesses, comparison, fixed test template, export |
| `fixtures` | Four reviewed scenario families, 384 authored inputs, source variants and policy evidence |
| `tests` | Behavioral, real-database, browser, and standalone-export verification |
| `docs` | Requirements, decisions, evidence, integration limits, deployment/demo guidance |

Start with [the client contract](packages/contracts/view-model.ts), [architecture](docs/ARCHITECTURE.md), and [frontend replacement guide](frontend/README.md). UI-only contributors may replace `frontend` without changing backend rules. Shared contracts and client lifecycle need coordinated tests. `AGENTS.md` is the shared instruction source; `CLAUDE.md` points to it.

The [verification report](docs/VERIFICATION.md) distinguishes measured behavior, approved policy tests and independent product-security checks. The [fixture backlog](docs/FIXTURE_BACKLOG.md) distinguishes implemented scenarios from deferred proposals.

## Live integrations and limits

All three Nemotron choices are visible but disabled until their real tool round-trip smoke checks pass. Put `NVIDIA_API_KEY` only in the ignored root `.env` or private worker environment, then restart `npm run worker`. Never put it in `VITE_*`, browser storage, a prompt, or source control. The deterministic path remains available without NVIDIA.

Account setup is now complete: a dedicated NVIDIA key is configured locally, and Ultra has passed live readiness. Readiness is reverified at worker startup; a prior success does not force-enable a model. Private hosted Spacetime `legacydiff-dev-v5iw5` is installed and paused for future hosting work. The active application continues to use the tested local database and private local worker.

The repository was empty at clone time. The build branch is now published with explicit authorization. Existing runs retain their **Local fixture** evidence labels; publishing source does not change saved provenance or enable a GitHub-backed catalog automatically. No public application deployment or hackathon submission has been performed.

GitHub Actions checks types, lint, formatting, TypeScript tests, Python tests and the frontend build on pull requests. Real-database, browser and NVIDIA checks require the local services described above and remain separate from hosted CI.

Docker's engine was unavailable during the build. The current runner is explicitly a **trusted-fixture local fallback** with reduced isolation. It accepts only bundled allowlisted, hash-verified synthetic files. It is not an arbitrary-code sandbox or public execution service. See [runner controls](backend/runner/README.md) and [verification evidence](docs/VERIFICATION.md).

The current local iteration adds returns, pricing, accounts payable and permissions with 96 authored synthetic inputs each (384 total). Choose **New comparison** in Working to select a scenario. Corpus comparisons, independent requirements, revision-bound policy approval and standalone exports are implemented but await the user-requested validation pass. No synthetic run results are prefilled. See [suite contracts](fixtures/SUITES.md).
