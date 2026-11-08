# Frontend developer guide

This directory owns React presentation, layout, browser navigation, and private unsent drafts. It can be redesigned or replaced without changing the application backend.

## Start reading

- `src/App.tsx`: application shell and URL navigation. Opening a room never starts work.
- `src/components/Home.tsx`: confirmed comparison, review queue, and history views.
- `src/components/SetupPanel.tsx`: source-pair selection and explicit start actions.
- `src/components/Workspace.tsx`: measured findings and collaborative room layout.
- `src/components/ReviewPanel.tsx`: local drafts, exact proposal previews, and approval previews.
- `src/components/RunResults.tsx`: measured cases, pinned evidence, and decision-specific validation history.
- `src/styles.css` and `src/styles/workspace.css`: visual tokens, application layout, and workspace styling.
- `src/presentation.ts`: small presentation selectors, tested in `presentation.test.ts`.

The canonical DTO and operation contract lives in `../../packages/contracts/view-model.ts`. The local `view-model.ts` only re-exports it. `../../packages/client/react.ts` provides `useLegacyDiff()`, backed by the stable client adapter. Generated database bindings are outside this frontend.

`startComparison` resolves to the committed `{ roomId, runId }`. Navigate to that returned address; do not guess the new run from the newest subscription record. Another participant may create a different run at the same time.

## Safe UI replacement

Replace components, CSS, typography, navigation, and responsive layouts here. Keep calls through `state.actions`; never import server modules, invoke Python, fetch providers, or reconstruct authorization in a component. Backend reducers remain authoritative even when the UI disables a button.

Preserve these behaviors:

- Wait for `ready` before mutations. Render stale/disconnected state. Do not replay offline actions.
- Keep each participant's navigation and unsent rationale independent. Draft storage is scoped to identity and run; do not put provider secrets or auth tokens in this directory.
- Do not preselect an intended policy. Preview the complete expectation set and pinned evidence before publishing.
- Capture the proposal revision and decision version when opening approval. A later subscription update must invalidate the preview, not silently change what will be approved. Preserve the local draft on conflicts.
- Use the run's pinned source snapshots for historical source display. Mutable catalog data describes new comparisons only.
- Show actual execution, validation, and activity records. Empty, pending, failed, and unavailable states are legitimate outcomes.
- Baseline stays left, candidate right. A failed acceptance test is distinct from an execution error.
- Sharing copies a room locator. Admission and roles are granted by the server.

Contract changes belong in `packages/contracts` and require coordinated client/backend updates and tests. Do not edit generated bindings or weaken a reducer to fit a visual change.

## Verify

From the repository root:

```powershell
npm run typecheck
npx tsx --test apps/web/src/presentation.test.ts
npm run build
npx playwright test tests/e2e.spec.ts
```

The end-to-end test requires the local Spacetime module and worker to be running. It creates real synthetic comparison records using independent browser identities. It exercises admission, comments, evidence pins, stale approval, measured failure, export, reconnect, history navigation, and a narrow layout. It does not prove live NVIDIA access.

The second browser flow covers defer without tests, exclusion with a measured passing candidate, keyboard dialog focus restoration, and a separate supplied-corrected comparison. A competing start in the same room may be rejected by the backend's active-run limit; preserve its setup and allow a deliberate retry after the current comparison finishes.

Visual direction: cool porcelain and ink, plum baseline and teal candidate, restrained ochre for unresolved differences. The paired observed outputs are the main visual signature. Keep status understandable without color and preserve keyboard focus when closing dialogs.
