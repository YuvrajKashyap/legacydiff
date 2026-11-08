# Shared integration and contracts

- `client/react.ts`: the React entrypoint used by the frontend.
- `client/connection.ts`: saved identity, subscriptions, readiness, reconnect and typed operations.
- `client/generated/`: generated Spacetime bindings. Regenerate through the root scripts; never hand-edit.
- `contracts/view-model.ts`: start here for the public UI state/action contract.
- `contracts/scenarios.ts`: strict four-scenario JSON schemas and action interfaces.
- `contracts/validation.ts`: classic returns schemas.
- `contracts/wire.ts`: generated-wire to application DTO conversions.
- `contracts/review.ts`: backend review rules; not allowed in the browser runtime import graph.

Shared types allow coordinated changes without coupling frontend components to worker or database implementations. Runtime authorization always belongs to the backend.
