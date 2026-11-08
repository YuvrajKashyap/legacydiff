import { execFile, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// Leave cleanup/commit headroom inside the 60-second deterministic job lease.
const OPERATION_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve();

  if (process.platform === "win32") {
    const taskkill = join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "taskkill.exe",
    );
    return new Promise((resolve, reject) => {
      // Preserve the parent until taskkill enumerates its descendants. Killing
      // only Python first can orphan a fixture before /T can find it.
      execFile(
        taskkill,
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, timeout: 10_000 },
        (error) => {
          if (!error || child.exitCode !== null || child.signalCode !== null) {
            resolve();
          } else {
            reject(new Error("Runner process-tree cleanup failed."));
          }
        },
      );
    });
  }

  // POSIX children are started in a new session below. This negative PID can
  // therefore target only the process group owned by this runner invocation.
  return new Promise((resolve, reject) => {
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    try {
      signalGroup("SIGTERM");
      setTimeout(() => {
        try {
          signalGroup("SIGKILL");
          resolve();
        } catch {
          reject(new Error("Runner process-group cleanup failed."));
        }
      }, 1000);
    } catch {
      reject(new Error("Runner process-group cleanup failed."));
    }
  });
}

/** Private process boundary. Requests are constructed by the worker, never forwarded HTTP. */
export function runPython(
  request: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) {
    return Promise.reject(new Error("Runner operation cancelled."));
  }

  // Serialize before spawning so a rejected request never leaves a waiting child.
  let payload: string;
  try {
    payload = JSON.stringify(request);
  } catch {
    return Promise.reject(new Error("Runner request is not serializable."));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python",
      ["-m", "services.runner.cli"],
      {
        cwd: process.cwd(),
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let closed = false;
    let cleanupFinished = true;
    let settled = false;
    let exitCode: number | null = null;

    const finish = () => {
      if (!closed || !cleanupFinished || settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) return reject(failure);
      if (exitCode !== 0)
        return reject(new Error("Runner rejected the request."));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Malformed runner result."));
      }
    };

    const fail = (message: string) => {
      if (failure || settled) return;
      failure = new Error(message);
      cleanupFinished = false;
      void terminateProcessTree(child)
        .catch(() => {
          failure = new Error(
            "Runner cleanup failed; process state is uncertain.",
          );
          child.kill();
        })
        .finally(() => {
          cleanupFinished = true;
          finish();
        });
    };

    const timer = setTimeout(
      () => fail("Runner operation timed out."),
      OPERATION_TIMEOUT_MS,
    );
    const abort = () => fail("Runner operation cancelled.");
    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) fail("Runner output limit exceeded.");
      else if (!failure) chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Bound both streams while keeping private diagnostics out of responses.
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) fail("Runner output limit exceeded.");
    });
    child.stdin.on("error", () =>
      fail("Runner input stream closed unexpectedly."),
    );
    child.on("error", () => fail("Python runner unavailable."));
    child.on("close", (code) => {
      exitCode = code;
      closed = true;
      finish();
    });
    if (signal?.aborted) abort();
    else child.stdin.end(payload);
  });
}
