# LegacyDiff contributor instructions

Read docs/BUILD_REQUIREMENTS.md and docs/EXECUTION_PLAN.md. Preserve the approved product and security invariants.

Use the clean-codebase skill. Keep code readable, responsibility-based, and formatted. Frontend visuals may be replaced independently by Claude or another contributor.

- apps/web: replaceable React presentation; no authorization, execution, provider keys, or business-policy authority.
- packages/client: stable browser integration and subscriptions; coordinate changes with backend owner.
- packages/contracts: shared types and schemas; coordinate changes across consumers.
- spacetime: authoritative database, access checks, reducers, approval/job invariants.
- services: trusted worker, AI adapters, and reviewed runner.
- fixtures: synthetic sources and evidence only.
- tests and docs: reproducible verification and developer handoff.

UI-only work must not change backend rules or generated bindings to make a screen work. Preserve reconnect readiness, independent navigation/drafts, and explicit approval previews. Contract changes require coordinated implementation and tests, not permission for routine fixes.

No push/publication, public deployment, paid provisioning, access expansion, or submission without explicit authorization. Never commit secrets. Report verified behavior separately from unavailable live integrations.
