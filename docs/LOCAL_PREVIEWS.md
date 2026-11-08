# Main and Working previews

Run `npm run browse` from the working checkout. The launcher starts background services without opening an external browser. Keep these URLs as two tabs in Codex's in-app browser:

| Version | Frontend | Database | Worker |
| --- | --- | --- | --- |
| Working | http://127.0.0.1:5174 | 127.0.0.1:3000 | 127.0.0.1:3001 |
| Main | http://127.0.0.1:5174/main/ | 127.0.0.1:3000 | 127.0.0.1:3001 |

Main and Working are two code versions of the same workspace. Both share Working's database, private worker, AI configuration, rooms, and browser identity. Main's internal port 5175 is proxied through Working's `/main/` path; use the URLs above, not port 5175 directly. Navigation and unsaved component drafts remain independent between tabs.

Main is a separate detached managed worktree that starts only a frontend. It never publishes a backend or starts a database or worker. Its Vite configuration disables environment-file loading; no Main .env or provider key is copied into the renderer. Main uses its installed source dependencies and Working's Vite/React plugin tooling. Working's current backend is authoritative. Older Main code only displays the scenarios and contracts it understands; new scenarios appear after the frontend changes merge and Main is explicitly refreshed.

- `npm run browse`: start or reuse the local services.
- `npm run browse:stop`: stop only processes recorded and still verified as launcher-owned; preserve all data. Services started separately are left running.
- `npm run browse:refresh`: stop launcher-owned services, fetch origin/main, update the clean Main worktree, reinstall its locked dependencies, and start both versions. This does not modify the Working checkout or merge any code. Dirty Main worktrees are refused. Stop a separately started Main service before refreshing.

Before changing from the older isolated-preview launcher, run `npm run browse:stop` to stop its recorded Main services. Existing Main `.local` data, keys, exports, and logs remain intact but are no longer used. Unrecorded services are left alone.

New logs, including `browse-main-web.log`, are in Working's `.local` directory. Main installs its locked frontend dependencies when missing. Only Working publishes its module with `--delete-data=never`; Main never publishes. Incompatible migrations fail rather than resetting data. If startup fails, inspect the log; do not clear `.local` to fix it.

Working proxies `/main` and WebSocket traffic to Main's internal listener. `scripts/main-preview.ts` sets Main's source root, `/main/` asset base, and HMR client routing through port 5174 without modifying the pinned checkout. Activated locally November 8, 2026: both pages loaded the same saved returns comparison and AI-ready status through the shared backend. Only the compilation and binding generation needed for startup were run; scenario execution and broader verification remain deferred at the user’s request.

## One-time checkout registration

Create a managed worktree at origin/main using Codex's create_worktree tool. Save its absolute path in the Working checkout's ignored `.local/browse.json`:

```json
{ "mainPath": "C:/absolute/path/to/managed/legacydiff" }
```

Run scripts/setup-local.ps1 in Working if its dependencies and Spacetime tools have not been initialized. Then run npm run browse. The launcher verifies both folders belong to the same Git repository. It never creates or deletes worktrees itself. Do not edit the managed Main copy; edit Working and refresh Main after changes merge.

This is a local developer workflow, not public hosting. Worker addresses remain hard-coded to loopback; configurable ports cannot widen network access. The existing trusted-fixture isolation limits still apply. No new services, skill installations or provider credentials are required.
