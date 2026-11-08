# Frontend developer guide

`frontend/` owns React presentation, layout, browser navigation, and private unsent drafts. It can be redesigned or replaced independently of `backend/`, which owns execution, provider integration, database authorization, and business rules.

## Read in this order

1. `src/main.tsx` mounts React and loads styles.
2. `src/App.tsx` connects the client snapshot to browser-local routing, setup, and room screens. Opening a room never starts work.
3. `src/comparison-summaries.ts` adapts confirmed classic and scenario runs for `components/Home.tsx`. All comparisons, Needs review, and History are overlapping views of the same records.
4. `components/ScenarioSetup.tsx` selects a bundled scenario and model. `ScenarioWorkspace.tsx` owns the review flow, draft, and exact approval preview. `ScenarioResults.tsx` handles paged measured outputs and recorded AI summaries.
5. For the classic returns flow, read `SetupPanel.tsx`, `Workspace.tsx`, and `ReviewPanel.tsx`. `RunResults.tsx`, `CaseTable.tsx`, and `SourcePanel.tsx` render its result, expectation, and source sections.
6. `investigation.ts` parses classic provider activity; `InvestigationPanel.tsx` displays it. `presentation.ts` contains pure display helpers. `Primitives.tsx` owns common badges, errors, and native dialogs.
7. `src/styles.css` defines visual tokens and the shell. `src/styles/` contains workspace, investigation, and scenario styles.

Module comments explain responsibility. Comments around drafts, navigation, and approval describe invariants that a visual rewrite must preserve; routine JSX remains readable without line-by-line narration.

## Integration boundary

The canonical presentation contract is [`../packages/contracts/view-model.ts`](../packages/contracts/view-model.ts), with scenario types in [`../packages/contracts/scenarios.ts`](../packages/contracts/scenarios.ts). `src/view-model.ts` only re-exports the shared contract. [`../packages/client/react.ts`](../packages/client/react.ts) supplies `useLegacyDiff()`, including readiness, confirmed records, and action methods. Generated database bindings stay outside the frontend.

Components call `state.actions` for the classic flow and admission, or `state.scenarioActions` for scenarios. They must not import backend modules, invoke Python, call providers, hold secrets, or treat a disabled button as authorization. [`../backend/database/`](../backend/database/) remains authoritative for roles, revisions, approvals, and job state.

Both start operations resolve to the committed `{ roomId, runId }`. Navigate to that address instead of guessing the new run from the latest subscription record. Another participant may create work concurrently.

## Preserve during a UI replacement

- Wait for `ready` before mutations and show disconnected/stale state. Never replay offline actions automatically.
- Keep navigation and unsent rationale private to each browser identity and run. Subscription updates must not overwrite a draft.
- Show intended policies as choices requiring deliberate publication and approval. Preview the exact expectation set, rationale, and pinned evidence before a mutation.
- Capture proposal revision and decision version when opening approval. Changes or disconnects invalidate that preview; do not silently approve a newer revision. Preserve the draft on conflicts.
- Render historical sources and evidence from the frozen run manifest/snapshots. The mutable catalog is for new comparisons.
- Keep observed outputs, independent requirements, proposed expectations, and approved acceptance results separate. AI summaries are analysis, not measured results or approvals.
- Display only actual execution, validation, and activity records. Missing, failed, cancelled, and unavailable outcomes must remain honest. Export requires a recorded validation result; that result may legitimately fail.
- Keep baseline on the left and candidate on the right. Distinguish failed assertions from execution errors and never infer correctness from matching outputs.
- A shared URL identifies a room. The server grants admission and roles. Sidebar identity labels are cosmetic and do not replace the authenticated identity.

Contract changes require coordinated updates in `packages/contracts`, `packages/client`, and `backend`, followed by appropriate authorized verification. Never edit generated bindings manually or weaken a reducer to accommodate presentation.

## Verification when authorized

From the repository root:

```powershell
npm run typecheck
npx tsx --test frontend/src/presentation.test.ts
npm run build
npx playwright test tests/e2e.spec.ts
```

The browser suite requires the local database and worker. Historical tests exercise real synthetic classic returns comparisons, independent identities, admission, comments, stale approval, validation, export, reconnect, and narrow layouts. They do not prove the new four-scenario flow or current live provider readiness. See [`../docs/VERIFICATION.md`](../docs/VERIFICATION.md) for dated evidence and unverified changes. The current source reorganization has not been checked because the user requested no tests/checks during this iteration.

Visual direction remains porcelain and ink, plum baseline and teal candidate, with restrained ochre for unresolved differences. Keep statuses understandable without color and restore keyboard focus when dialogs close.

## Guided review screens

`components/Lab.tsx` shows the saved AI team trace and combined public finding. `ScenarioResults.tsx` keeps the three specialist summaries beside review. `CaseChat.tsx` asks the worker about the current saved ticket; shared answers are server records while an unsent question stays in this browser. `CollaborationPanel.tsx` shows actual room membership and connection state. `DemoPage.tsx` is a separate read-only, staged team walkthrough; its illustrative contributions never become real comments, presence or approvals.
