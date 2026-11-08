import test from "node:test";
import assert from "node:assert/strict";
import { localRuntime } from "../backend/worker/local-runtime";

test("local runtime isolates ports without permitting remote hosts", () => {
  const main = localRuntime({
    LEGACYDIFF_DB_PORT: "3010",
    LEGACYDIFF_WORKER_PORT: "3011",
    LEGACYDIFF_WEB_PORT: "5175",
  });
  assert.equal(main.databaseUri, "ws://127.0.0.1:3010");
  assert.equal(main.databaseHttp, "http://127.0.0.1:3010");
  assert.deepEqual(main.origins, [
    "http://127.0.0.1:5175",
    "http://localhost:5175",
  ]);
  assert.equal(localRuntime({}).workerPort, 3001);
  for (const value of [
    "https://example.com",
    "0",
    "65536",
    "3010.5",
    "3000x",
  ]) {
    assert.throws(() => localRuntime({ LEGACYDIFF_DB_PORT: value }));
  }
  assert.throws(() => localRuntime({ LEGACYDIFF_WORKER_PORT: "3000" }));
});
