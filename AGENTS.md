# LegacyDiff contributor instructions

Read docs/BUILD_REQUIREMENTS.md and docs/EXECUTION_PLAN.md. Preserve the approved product and security invariants.

Use the clean-codebase skill. Keep code readable, responsibility-based, and formatted. Frontend visuals may be replaced independently by Claude or another contributor.

- frontend: replaceable React presentation; no authorization, execution, provider keys, or business-policy authority.
- packages/client: stable browser integration and subscriptions; coordinate changes with backend owner.
- packages/contracts: shared types and schemas; coordinate changes across consumers.
- backend/database: authoritative database, access checks, reducers, approval/job invariants.
- backend/worker, backend/ai and backend/runner: trusted worker, AI adapters, and reviewed runner.
- fixtures: synthetic sources and evidence only.
- tests and docs: reproducible verification and developer handoff.

UI-only work must not change backend rules or generated bindings to make a screen work. Preserve reconnect readiness, independent navigation/drafts, and explicit approval previews. Contract changes require coordinated implementation and tests, not permission for routine fixes.

No push/publication, public deployment, paid provisioning, access expansion, or submission without explicit authorization. Never commit secrets. Report verified behavior separately from unavailable live integrations.

## Current hands-on iteration

Keep edits local until Yuvraj explicitly asks to push. Yuvraj explicitly reopened full verification and authorized pushing codex/local-development and merging to main after successful checks on November 8. Verify the complete release, preserve existing evidence, and report any remaining limitations. Future UI iteration remains separate from backend authority. Main and Working are code views of one shared local workspace; retain the underlying authorization identity and use Main workspace / Identity yxk220038 / YK only as display labels.

## Readability and navigation

Use explicit frontend/backend directories, with shared client and contracts in packages. Prefer the fewest focused files that preserve clear responsibilities; avoid needless helpers, facade layers and deep folders. Use descriptive names and logical declaration order. Add useful module-purpose and operation comments throughout handwritten code, especially around state, approvals and failure handling; keep them accurate and leave generated code alone. Maintain the README directory map and folder reading guides. Explorer excludes generated/runtime clutter without deleting it.

Comments must use simple everyday language that a newcomer can follow. Explain what each important section does and why, including state changes and failure paths. Comment throughout meaningful steps, not only module headers; avoid unexplained jargon and redundant comments on obvious lines.

