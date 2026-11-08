/** Starts the worker, reports what is ready, and takes one saved job at a time. */
import { executeSuiteJob } from "./scenario-jobs";
import { suiteManifestSchema } from "../../packages/contracts/scenarios";
import { runPython } from "./runner";
import { localRuntime } from "./local-runtime";
import { workerConnection } from "./bootstrap";
import { readCatalog } from "./catalog";
import { catalogToWire } from "../../packages/contracts/wire";
import { executeJob } from "./jobs";
import { startPrivateHttp } from "./http";
import { createNvidiaTransport, probeModel, MODELS } from "../ai/index";
import type { Artifact } from "../ai/evidence";

const runtime = localRuntime(process.env);

const session = await workerConnection();
const connection = session.connection;
const verified = new Set<string>();
const persistArtifact = async (artifact: Artifact) => {
  await connection.reducers.recordArtifact({
    value: {
      ...artifact,
      commit: artifact.commit ?? undefined,
      gitBlobSha: artifact.gitBlobSha ?? undefined,
      url: artifact.url ?? undefined,
    },
  });
};
let catalog = await readCatalog(verified, persistArtifact);
await connection.reducers.updateCatalog({ value: catalogToWire(catalog) });
const suiteCatalogPayload = JSON.stringify(
  suiteManifestSchema.parse(await runPython({ op: "suite_manifest" })),
);
await connection.reducers.updateSuiteCatalog({ payload: suiteCatalogPayload });
const http = startPrivateHttp();
console.log(
  `Private worker ready on 127.0.0.1:${runtime.workerPort}; trusted synthetic fixtures only.`,
);
let stopping = false;
const readinessController = new AbortController();
let active:
  { id: string; suite?: boolean; controller: AbortController } | undefined;
const heartbeat = setInterval(
  () =>
    void connection.reducers
      .updateCatalog({ value: catalogToWire(catalog) })
      .then(() => connection.reducers.recoverExpiredJobs({}))
      .then(() =>
        connection.reducers.updateSuiteCatalog({
          payload: suiteCatalogPayload,
        }),
      )
      .then(() => connection.reducers.recoverSuiteJobs({}))
      .catch(() => console.error("Worker database heartbeat failed.")),
  30000,
);
const cancellation = setInterval(() => {
  if (active) {
    const job = [
      ...(active.suite
        ? connection.db.workerSuiteJobs.iter()
        : connection.db.workerJobs.iter()),
    ].find((j) => j.id === active!.id);
    if (job?.state === "cancelling") active.controller.abort();
  }
}, 200);
process.on("SIGINT", () => {
  stopping = true;
  readinessController.abort();
  active?.controller.abort();
});
process.on("SIGTERM", () => {
  stopping = true;
  readinessController.abort();
  active?.controller.abort();
});

// Check models in the background so normal comparisons can keep running.
// Keep each model disabled until it passes its own real test.
async function verifyProviderModels() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return;
  const transport = createNvidiaTransport({ apiKey });
  const failures = new Map<string, string>();
  for (const model of MODELS) {
    if (stopping) break;
    const result = await probeModel(
      transport,
      model.id,
      readinessController.signal,
    );
    if (stopping) break;
    if (result.ready) verified.add(model.id);
    else failures.set(model.id, result.reason);
    catalog = await readCatalog(verified, persistArtifact);
    for (const entry of catalog.models) {
      const failure = failures.get(entry.id);
      if (failure) entry.reason = failure;
    }
    await connection.reducers.updateCatalog({ value: catalogToWire(catalog) });
    console.log(
      "Provider readiness:",
      model.id,
      result.ready ? "verified" : "unavailable",
      `${result.calls} calls`,
      `${result.durationMs} ms`,
    );
  }
}
const readiness = verifyProviderModels().catch(() => {
  console.error(
    "Provider readiness checks interrupted; unverified models remain disabled.",
  );
});
// Ask the database for time-limited permission before starting a job.
// Do not repeat an expired AI job: the earlier request may already have been billed.
while (!stopping) {
  const suiteNext = [...connection.db.workerSuiteJobs.iter()].find(
    (job) =>
      job.state === "queued" ||
      (job.state === "running" &&
        !["investigate", "chat"].includes(job.kind) &&
        job.attempt < 3 &&
        Number(job.leaseUntil / 1000n) < Date.now()),
  );
  if (suiteNext) {
    try {
      await connection.reducers.claimSuiteJob({ jobId: suiteNext.id });
      const claimed = [...connection.db.workerSuiteJobs.iter()].find(
        (job) => job.id === suiteNext.id,
      )!;
      active = {
        id: claimed.id,
        suite: true,
        controller: new AbortController(),
      };
      await executeSuiteJob(connection, claimed, active.controller.signal);
    } catch (error) {
      console.error(
        "Scenario job failed:",
        error instanceof Error ? error.message : "unknown",
      );
    } finally {
      active = undefined;
    }
    continue;
  }
  const next = [...connection.db.workerJobs.iter()].find(
    (job) =>
      job.state === "queued" ||
      (job.state === "running" &&
        Number(job.leaseUntil / 1000n) < Date.now() &&
        !job.withAi &&
        job.attempt < 3),
  );
  if (next) {
    try {
      await connection.reducers.claimJob({ jobId: next.id });
      const claimed = [...connection.db.workerJobs.iter()].find(
        (j) => j.id === next.id,
      )!;
      active = { id: next.id, controller: new AbortController() };
      await executeJob(connection, claimed, catalog, active.controller.signal);
    } catch (error) {
      console.error(
        "Job failed:",
        error instanceof Error ? error.message : "unknown",
      );
    } finally {
      active = undefined;
    }
  } else await new Promise((resolve) => setTimeout(resolve, 300));
}
clearInterval(heartbeat);
clearInterval(cancellation);
await readiness;
http.close();
connection.disconnect();
