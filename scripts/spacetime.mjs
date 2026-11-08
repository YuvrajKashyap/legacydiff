/**
 * Find the installed local Spacetime command and pass through its arguments.
 * Package scripts do not need to know its machine-specific path.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const executable =
  process.env.SPACETIME_CLI ??
  (process.platform === "win32"
    ? resolve(".local/tools/spacetime/spacetimedb-cli.exe")
    : "spacetime");
const result = spawnSync(executable, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
