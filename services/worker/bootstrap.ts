import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { connectDatabase } from "./database";

export async function workerConnection() {
  await mkdir(".local", { recursive: true });
  const token = await readFile(".local/worker-token", "utf8").catch(
    () => undefined,
  );
  const session = await connectDatabase(token, true);
  await writeFile(".local/worker-token", session.token, { mode: 0o600 });
  // Uses the local database publisher's existing CLI authentication, never the browser token.
  const cli =
    process.env.SPACETIME_CLI ?? ".local/tools/spacetime/spacetimedb-cli.exe";
  await promisify(execFile)(
    cli,
    [
      "call",
      "--server",
      "http://127.0.0.1:3000",
      "legacydiff-local-v2",
      "set_worker",
      JSON.stringify(session.identity),
    ],
    { windowsHide: true },
  );
  return session;
}
