# Deployment boundaries

The full verified application runs as a loopback-only Windows demonstration. On November 8, 2026, the user authorized a Vercel frontend deployment linked to main. This does not deploy the private runner or enable the hosted database.

## Three independent services

1. **Static frontend:** `npm run build` produces `dist/`. A static host serves these files; it does not execute Python or deploy the database. Configure the client database/worker addresses through the documented client adapter options before building. Production needs HTTPS/WSS and exact allowed origins.
2. **Spacetime database/module:** publish the TypeScript module to an explicitly approved instance using compatible pinned CLI/server/SDK/bindings. Preserve database signing identity and data. Apply supported migrations; never add automatic destructive reset flags. The database publisher configures a separate worker identity with `set_worker`; ordinary participants cannot grant worker access.
3. **Private worker host:** run the Node worker with Python and the reviewed fixture manifest. It needs outbound NVIDIA/GitHub access only for enabled integrations, authenticated access to Spacetime, and private storage for temporary exports. The current reduced-isolation fallback must remain local-only. A future host needs the actual tested restricted Docker runner before a public demonstration with broader reach.

The worker HTTP interface provides health and authenticated export only. Do not expose the process runner, arbitrary tool calls, Docker socket, filesystem paths, or provider keys. If operating across two devices, use a genuinely reachable approved database/worker and authenticated HTTPS; two local browser profiles demonstrate simultaneous identities but do not prove two-device deployment.

## Secrets and configuration

- `NVIDIA_API_KEY`: server-only worker secret; optional for deterministic mode. Configure through the host secret manager. Local `.env` is ignored.
- `SPACETIME_CLI`: local bootstrap executable path. Production should provision a worker identity deliberately, not depend on a developer's CLI session.
- `PYTHON`: reviewed Python executable path.
- `.local/worker-token`: local worker credential, never the same token as a participant.
- `.local/jwt-private.pem`: private local database signing key; never publish.
- Client addresses/database name: public configuration, not credentials.

Current frontend origin is `http://127.0.0.1:5174` (localhost alias allowed). Database is `127.0.0.1:3000`; private HTTP is `127.0.0.1:3001`. No firewall or security settings were changed. Restart tests must preserve data/key files. Worker readiness requires its recent catalog heartbeat; models require actual tool readiness probes.

## Release gate before any public hosting

Obtain explicit authorization for the exact hosting/publication action. Then verify supported hosting, secure origin/address configuration, membership and cross-room access, abuse/resource controls, cancellation/recovery, two-device reachability if claimed, secret management and standalone export. Confirm that the runner restrictions actually run on that host. A green Vite deployment alone does not meet this gate.

The user separately authorized NVIDIA and Spacetime account setup. A dedicated NVIDIA worker key is stored in ignored `.env`; it expires December 8, 2026. The private hosted database [legacydiff-dev-v5iw5](https://spacetimedb.com/@yuvrajkashyap/legacydiff-dev-v5iw5) has the real module and owner configuration installed. It is paused pending a deliberately hosted worker and access/reachability checks. The application remains on the local backend. No public frontend/worker, paid service purchase or sponsor submission occurred. Sponsor eligibility and entry status remain separate evidence checks.

Hosted CLI auth uses `--config-path .local/hosted-cli.toml` so login cannot replace the local publisher identity. Future updates must preserve data and pass `--delete-data=never`; do not copy initial empty-database setup commands into routine deployment scripts. Do not point the current local fallback worker at a remotely reachable job queue.

## Vercel frontend

The repository-root vercel.json builds only the React/Vite frontend into dist; the database module is built separately. Git integration follows main. No worker secrets are required or uploaded. Without an explicitly configured VITE_SPACETIME_URI, non-loopback pages show a frontend-preview notice and do not open a database connection. Comparisons, approval and export remain disabled. Do not configure a hosted backend until the release gate above is met.
