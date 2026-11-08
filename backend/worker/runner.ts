/** Starts Python with time and output limits, and stops its programs when work is cancelled. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// Stop Python early enough to clean up and save the result before the 60-second job permission expires.
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
      // Let Windows find Python and every program it started before stopping them.
      // Stopping only Python first could leave one of those programs running.
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

  // On Linux and macOS, start Python in its own group. A negative process ID
  // tells the system to stop that whole group, without touching unrelated work.
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

/** The worker builds each Python request. Browser requests are never passed straight to Python. */
export function runPython(
  request: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) {
    return Promise.reject(new Error("Runner operation cancelled."));
  }

  // Convert the request to JSON before starting Python, so bad input cannot leave Python waiting.
  let payload: string;
  try {
    payload = JSON.stringify(request);
  } catch {
    return Promise.reject(new Error("Runner request is not serializable."));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python",
      ["-m", "backend.runner.cli"],
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
      // Count normal output and error output toward the limit. Keep private errors out of replies.
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
