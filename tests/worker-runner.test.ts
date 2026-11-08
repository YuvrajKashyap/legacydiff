import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { runPython } from "../services/worker/runner";

const execFileAsync = promisify(execFile);

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopOwnedProcess(pid: number) {
  if (!alive(pid)) return;
  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    }).catch(() => undefined);
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* Already exited. */
    }
  }
}

async function controlledHarness(
  mode: "wait" | "overflow",
  callback: (directory: string) => Promise<void>,
) {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "legacydiff-worker-test-"));
  await mkdir(join(directory, "services", "runner"), { recursive: true });
  // Test-only replacement at the fixed module location. Production runPython
  // still accepts no program path, command, source text, or spawn adapter.
  await writeFile(
    join(directory, "services", "runner", "cli.py"),
    `
import json, os, pathlib, subprocess, sys, time
child = subprocess.Popen([sys.executable, '-I', '-c', 'import time; time.sleep(120)'])
pathlib.Path('owned-processes.json').write_text(json.dumps([os.getpid(), child.pid]))
if ${mode === "overflow" ? "True" : "False"}:
    sys.stdout.write('x' * (3 * 1024 * 1024))
    sys.stdout.flush()
time.sleep(120)
`,
  );
  process.chdir(directory);
  try {
    await callback(directory);
  } finally {
    const pids: number[] = await readFile(
      join(directory, "owned-processes.json"),
      "utf8",
    )
      .then(JSON.parse)
      .catch(() => []);
    for (const pid of pids) await stopOwnedProcess(pid);
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

async function harnessPids(directory: string): Promise<number[]> {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      return JSON.parse(
        await readFile(join(directory, "owned-processes.json"), "utf8"),
      );
    } catch {
      await delay(10);
    }
  }
  assert.fail("Controlled Python harness did not start");
}

test("worker executes an actual trusted comparison", async () => {
  const result = (await runPython({
    op: "compare",
    baseline: "legacy-v1",
    candidate: "rewrite-v2",
  })) as { mismatch_count: number };
  assert.equal(result.mismatch_count, 1);
});

test("pre-aborted runner request rejects without executing a module", async () => {
  await controlledHarness("wait", async (directory) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      runPython({ op: "manifest" }, controller.signal),
      /cancelled/,
    );
    await delay(100);
    const pids = await readFile(
      join(directory, "owned-processes.json"),
      "utf8",
    ).catch(() => "");
    assert.equal(pids, "");
  });
});

test("cancellation waits until the runner and its fixture child have exited", async () => {
  await controlledHarness("wait", async (directory) => {
    const controller = new AbortController();
    const result = runPython({ op: "manifest" }, controller.signal);
    const rejected = assert.rejects(result, /cancelled/);
    const pids = await harnessPids(directory);
    assert.equal(pids.every(alive), true);
    controller.abort();
    await rejected;
    assert.equal(
      pids.some(alive),
      false,
      "Cancellation returned while a fixture process remained alive",
    );
  });
});

test("output overflow also stops the complete runner process tree", async () => {
  await controlledHarness("overflow", async (directory) => {
    await assert.rejects(runPython({ op: "manifest" }), /output limit/);
    const pids = await harnessPids(directory);
    assert.equal(
      pids.some(alive),
      false,
      "Overflow returned while a fixture process remained alive",
    );
  });
});

test(
  "operation timeout stops the process tree before the worker lease expires",
  {
    timeout: 55000,
    skip: process.env.LEGACYDIFF_RUNNER_TIMEOUT_TEST !== "1",
  },
  async () => {
    await controlledHarness("wait", async (directory) => {
      const started = Date.now();
      await assert.rejects(runPython({ op: "manifest" }), /timed out/);
      const pids = await harnessPids(directory);
      assert.equal(pids.some(alive), false);
      assert.ok(
        Date.now() - started < 55000,
        "Cleanup exceeded deterministic lease headroom",
      );
    });
  },
);
