# Main and Working previews

Run `npm run browse` from the working checkout. The launcher starts background services without opening an external browser. Keep these URLs as two tabs in Codex's in-app browser:

| Version | Frontend | Database | Worker |
| --- | --- | --- | --- |
| Working | http://127.0.0.1:5174 | 127.0.0.1:3000 | 127.0.0.1:3001 |
| Main | http://127.0.0.1:5175 | 127.0.0.1:3010 | 127.0.0.1:3011 |

The top bar identifies the version and startup commit. Working changes hot-reload; restart to update its commit label. Main is a separate detached managed worktree. Each checkout owns its .local database, signing keys, worker identity and exports. Browser identity is separated by origin and database URI. Main starts empty; existing Working records are preserved. No records or provider secrets are copied between checkouts. Main runs deterministically unless you deliberately configure its own private .env.

- `npm run browse`: start or reuse the local services.
- `npm run browse:stop`: stop only processes recorded and still verified as launcher-owned; preserve all data. Services started separately are left running.
- `npm run browse:refresh`: stop launcher-owned services, fetch origin/main, update the clean Main worktree, reinstall its locked dependencies, and start both versions. This does not modify the Working checkout or merge any code. Dirty Main worktrees are refused. Stop a separately started Main service before refreshing.

Logs are in each checkout's `.local/browse-*.log`. First startup installs Main's locked dependencies and publishes its module with `--delete-data=never`. Incompatible migrations fail rather than resetting data. If worker startup fails, inspect the log; do not clear .local to fix it. The standalone runtime and reviewed CLI executable are reused from Working; mutable data and credentials are not shared.

## One-time checkout registration

Create a managed worktree at origin/main using Codex's create_worktree tool. Save its absolute path in the Working checkout's ignored `.local/browse.json`:

```json
{ "mainPath": "C:/absolute/path/to/managed/legacydiff" }
```

Run scripts/setup-local.ps1 in Working if its dependencies and Spacetime tools have not been initialized. Then run npm run browse. The launcher verifies both folders belong to the same Git repository. It never creates or deletes worktrees itself. Do not edit the managed Main copy; edit Working and refresh Main after changes merge.

This is a local developer workflow, not public hosting. Worker addresses remain hard-coded to loopback; configurable ports cannot widen network access. The existing trusted-fixture isolation limits still apply. No new services, skill installations or provider credentials are required.
