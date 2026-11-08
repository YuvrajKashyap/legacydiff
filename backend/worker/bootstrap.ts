/** Reuses the worker login and asks the database owner to authorize it. */
import { localRuntime } from "./local-runtime";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectDatabase } from "./database";

const runtime = localRuntime(process.env);

export async function workerConnection() {
  await mkdir(".local", { recursive: true });
  const token = await readFile(".local/worker-token", "utf8").catch(
    () => undefined,
  );
  const session = await connectDatabase(token, true);
  await writeFile(".local/worker-token", session.token, { mode: 0o600 });
  // Use the database owner's command-line login here, never a participant's browser login.
  const cli =
    process.env.SPACETIME_CLI ?? ".local/tools/spacetime/spacetimedb-cli.exe";
  await promisify(execFile)(
    cli,
    [
      ...(process.env.LEGACYDIFF_CLI_CONFIG
        ? ["--config-path", process.env.LEGACYDIFF_CLI_CONFIG]
        : []),
      "call",
      "--server",
      runtime.databaseHttp,
      runtime.database,
      "set_worker",
      JSON.stringify(session.identity),
    ],
    { windowsHide: true },
  );
  return session;
}
