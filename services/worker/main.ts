import { workerConnection } from "./bootstrap";
import { readCatalog } from "./catalog";
import { catalogToWire } from "../../packages/contracts/wire";
import { executeJob } from "./jobs";
import { startPrivateHttp } from "./http";
import { createNvidiaTransport, probeModel, MODELS } from "../ai/index";
import type { Artifact } from "../ai/evidence";

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
const http = startPrivateHttp();
console.log(
  "Private worker ready on 127.0.0.1:3001; trusted synthetic fixtures only.",
);
let stopping = false;
const readinessController = new AbortController();
let active: { id: string; controller: AbortController } | undefined;
const heartbeat = setInterval(
  () =>
    void connection.reducers
      .updateCatalog({ value: catalogToWire(catalog) })
      .then(() => connection.reducers.recoverExpiredJobs({}))
      .catch(() => console.error("Worker database heartbeat failed.")),
  30000,
);
const cancellation = setInterval(() => {
  if (active) {
    const job = [...connection.db.workerJobs.iter()].find(
      (j) => j.id === active!.id,
    );
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

// Readiness checks may be slow. They never hold up the deterministic job loop or
// catalog heartbeat, and a model stays disabled until its own live proof passes.
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
while (!stopping) {
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
