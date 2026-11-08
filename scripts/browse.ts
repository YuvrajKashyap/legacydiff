import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";

const root = resolve(import.meta.dirname, "..");
const settingsPath = join(root, ".local/browse.json");
const statePath = join(root, ".local/browse-processes.json");
const mode = process.argv[2] ?? "start";
type OwnedProcess = { pid: number; executable: string; args: string[] };
let owned: OwnedProcess[] = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : [];

function run(
  executable: string,
  args: string[],
  cwd = root,
  env = process.env,
) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(`${executable} failed (${result.status}).`);
}
function git(args: string[], cwd = root) {
  const result = spawnSync("git", args, {
    cwd,
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function listening(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (open: boolean) => {
      socket.destroy();
      done(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}
async function waitFor(port: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await listening(port)) return;
    await delay(300);
  }
  throw new Error(
    `Port ${port} did not become ready. See .local/browse-*.log in its checkout.`,
  );
}
function start(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
) {
  const log = openSync(join(cwd, `.local/browse-${label}.log`), "a");
  const child = spawn(executable, args, {
    cwd,
    env,
    windowsHide: true,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.on("error", (error) => console.error(error.message));
  child.unref();
  closeSync(log);
  if (!child.pid) throw new Error(`Could not start ${label}.`);
  owned.push({ pid: child.pid, executable, args });
  writeFileSync(statePath, JSON.stringify(owned, null, 2));
}
async function stop() {
  // Verify PID ownership before terminating. A stale PID must never stop an unrelated process.
  for (const entry of owned) {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter 'ProcessId = ${entry.pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`,
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    if (!result.stdout.trim()) continue;
    const actual = JSON.parse(result.stdout);
    if (
      actual.ExecutablePath?.toLowerCase() !== entry.executable.toLowerCase() ||
      !entry.args.every((arg) => actual.CommandLine?.includes(arg))
    ) {
      throw new Error(
        `PID ${entry.pid} no longer matches the launcher record; refusing to stop it.`,
      );
    }
    run("taskkill.exe", ["/PID", String(entry.pid), "/T", "/F"]);
  }
  owned = [];
  writeFileSync(statePath, "[]");
}
async function stack(cwd: string, label: "Main" | "Working") {
  const main = label === "Main";
  const dbPort = main ? 3010 : 3000;
  const workerPort = main ? 3011 : 3001;
  const webPort = main ? 5175 : 5174;
  mkdirSync(join(cwd, ".local"), { recursive: true });
  const node = join(cwd, "node_modules/node/bin/node.exe");
  if (!existsSync(node)) {
    run(process.execPath, [process.env.npm_execpath!, "ci"], cwd);
  }
  if (!existsSync(join(cwd, "spacetime/spacetimedb/node_modules/typescript"))) {
    run(
      process.execPath,
      [process.env.npm_execpath!, "ci", "--prefix", "spacetime/spacetimedb"],
      cwd,
    );
  }
  const tools = join(root, ".local/tools/spacetime");
  const cli = join(tools, "spacetimedb-cli.exe");
  const standalone = join(tools, "spacetimedb-standalone.exe");
  if (!existsSync(standalone))
    throw new Error(
      "Run scripts/setup-local.ps1 in the working checkout first.",
    );
  const config = join(cwd, ".local/browse-cli.toml");
  const cliPrefix = main ? ["--config-path", config] : [];
  const env = {
    ...process.env,
    LEGACYDIFF_DB_PORT: String(dbPort),
    LEGACYDIFF_WORKER_PORT: String(workerPort),
    LEGACYDIFF_WEB_PORT: String(webPort),
    SPACETIME_CLI: cli,
    ...(main ? { LEGACYDIFF_CLI_CONFIG: config } : {}),
    VITE_SPACETIME_URI: `ws://127.0.0.1:${dbPort}`,
    VITE_SPACETIME_DATABASE: "legacydiff-local-v2",
    VITE_WORKER_URL: `http://127.0.0.1:${workerPort}`,
    VITE_INSTANCE_LABEL: label,
    VITE_INSTANCE_REVISION: `${git(["rev-parse", "--short", "HEAD"], cwd)}${main ? "" : " · live changes"}`,
  };
  if (!(await listening(dbPort))) {
    run(node, ["scripts/create-local-keys.mjs"], cwd);
    start(
      standalone,
      [
        "start",
        "--listen-addr",
        `127.0.0.1:${dbPort}`,
        "--data-dir",
        join(cwd, ".local/spacetime-data"),
        "--jwt-pub-key-path",
        join(cwd, ".local/jwt-public.pem"),
        "--jwt-priv-key-path",
        join(cwd, ".local/jwt-private.pem"),
        "--non-interactive",
      ],
      cwd,
      env,
      "database",
    );
    await waitFor(dbPort);
  }
  if (!(await listening(workerPort))) {
    // Publication preserves existing data and fails on migrations that require deletion.
    run(
      cli,
      [
        ...cliPrefix,
        "publish",
        "legacydiff-local-v2",
        "--server",
        `http://127.0.0.1:${dbPort}`,
        "--module-path",
        "spacetime/spacetimedb",
        "--no-config",
        "--delete-data=never",
        "--yes",
      ],
      cwd,
      env,
    );
    start(
      node,
      [
        "--env-file-if-exists=.env",
        "--import",
        "tsx",
        "services/worker/main.ts",
      ],
      cwd,
      env,
      "worker",
    );
    await waitFor(workerPort);
  }
  if (!(await listening(webPort))) {
    start(
      node,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      cwd,
      env,
      "web",
    );
    await waitFor(webPort);
  }
  const health = await fetch(`http://127.0.0.1:${workerPort}/health`).then(
    (response) => response.json(),
  );
  if (health.runner !== "trusted-fixture local fallback")
    throw new Error(`Unexpected service on port ${workerPort}.`);
  console.log(
    `${label}: http://127.0.0.1:${webPort} (${env.VITE_INSTANCE_REVISION})`,
  );
}

if (!["start", "stop", "refresh"].includes(mode))
  throw new Error("Use browse, browse:stop or browse:refresh.");
if (mode === "stop") {
  await stop();
} else {
  if (!existsSync(settingsPath))
    throw new Error(
      "Create a managed main worktree, then save its absolute path as mainPath in .local/browse.json. See docs/LOCAL_PREVIEWS.md.",
    );
  const { mainPath } = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (resolve(mainPath) === root)
    throw new Error("Main preview must use a separate checkout.");
  if (
    git(["rev-parse", "--git-common-dir"], mainPath) !==
    git(["rev-parse", "--git-common-dir"], root)
  ) {
    // Resolve relative output independently: both worktrees must share the same Git repository.
    const mainGit = resolve(
      mainPath,
      git(["rev-parse", "--git-common-dir"], mainPath),
    );
    const workingGit = resolve(
      root,
      git(["rev-parse", "--git-common-dir"], root),
    );
    if (mainGit.toLowerCase() !== workingGit.toLowerCase())
      throw new Error("Preview path belongs to another repository.");
  }
  if (git(["status", "--porcelain"], mainPath))
    throw new Error(
      "Main preview has edits. Preserve them before starting or refreshing.",
    );
  if (mode === "refresh") {
    await stop();
    git(["fetch", "origin", "main"]);
    git(["checkout", "--detach", "origin/main"], mainPath);
    run(process.execPath, [process.env.npm_execpath!, "ci"], mainPath);
    run(
      process.execPath,
      [process.env.npm_execpath!, "ci", "--prefix", "spacetime/spacetimedb"],
      mainPath,
    );
  }
  await stack(mainPath, "Main");
  await stack(root, "Working");
  console.log(
    "Keep these two URLs in Codex's in-app browser. No external browser is opened.",
  );
}
