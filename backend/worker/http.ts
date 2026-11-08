/** Serves local health checks and downloads decisions that the signed-in caller can see. */
import { scenarioRunSchema } from "../../packages/contracts/scenarios";
import { localRuntime } from "./local-runtime";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { connectDatabase } from "./database";
import { roomFromWire } from "../../packages/contracts/wire";
import { runPython } from "./runner";

const runtime = localRuntime(process.env);

const exportRequest = z
  .object({
    roomId: z.string().max(100),
    runId: z.string().max(100),
    decisionVersion: z.number().int().positive(),
  })
  .strict();
const origins = new Set(runtime.origins);

export function startPrivateHttp() {
  let activeExports = 0;
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, GET");
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/health" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ready",
          runner: "trusted-fixture local fallback",
        }),
      );
      return;
    }
    if (req.url !== "/export" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    if (activeExports >= 2) {
      res.writeHead(429).end("Export busy.");
      return;
    }
    activeExports++;
    let session: Awaited<ReturnType<typeof connectDatabase>> | undefined;
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token || token.length > 10000)
        throw new Error("Authentication required.");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) throw new Error("Request too large.");
      }
      const input = exportRequest.parse(JSON.parse(body));
      // Check access using the caller's login, not the worker's more powerful login.
      session = await connectDatabase(token);
      const wire = [...session.connection.db.visibleRooms.iter()].find(
        (room) => room.id === input.roomId,
      );
      if (!wire) throw new Error("Room access denied.");
      const suiteRow = [...session.connection.db.visibleSuiteRuns.iter()].find(
        (row) => row.id === input.runId && row.roomId === input.roomId,
      );
      if (suiteRow) {
        const run = scenarioRunSchema.parse(JSON.parse(suiteRow.payload));
        const decision = run.decisions.find(
          (item) => item.version === input.decisionVersion,
        );
        const policy = run.manifest.policies.find(
          (item) => item.id === decision?.policyId,
        );
        if (!decision?.validation || !policy || !run.comparison)
          throw new Error("Approved completed validation required.");
        await mkdir(".local/exports", { recursive: true });
        const directory = resolve(".local/exports", randomUUID());
        const result = (await runPython({
          op: "suite_export",
          scenario: run.scenarioId,
          output_dir: directory,
          snapshot: {
            decision: {
              version: decision.version,
              proposal_revision: decision.proposalRevision,
              reviewer: decision.reviewer,
              rationale: decision.rationale,
              policy: policy.id,
              approved_at: decision.createdAt,
            },
            cases: policy.cases,
            evidence: run.manifest.evidence,
            comparison: run.comparison,
            validation: decision.validation,
          },
        })) as { zip_path: string };
        const zip = await readFile(result.zip_path);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="legacydiff-${run.scenarioId}-decision-${decision.version}.zip"`,
        );
        res.end(zip);
        return;
      }
      const room = roomFromWire(wire),
        run = room.runs.find((r) => r.id === input.runId),
        decision = run?.decisions.find(
          (d) => d.version === input.decisionVersion,
        );
      if (
        !run ||
        !decision ||
        !decision.validation ||
        !["pass", "fail", "error"].includes(decision.validation.state)
      )
        throw new Error("A completed approved validation is required.");
      await mkdir(".local/exports", { recursive: true });
      const directory = resolve(".local/exports", randomUUID());
      const result = (await runPython({
        op: "export",
        output_dir: directory,
        snapshot: {
          decision: {
            version: decision.version,
            proposal_revision: decision.proposalRevision,
            reviewer: decision.reviewer,
            rationale: decision.rationale,
            choice: decision.choice,
            approved_at: decision.createdAt,
          },
          approved_cases: decision.cases,
          candidate: run.candidate,
          evidence: run.evidence.map((e) => {
            const stored = [
              ...session!.connection.db.artifactSnapshot.iter(),
            ].find(
              (a) =>
                a.value.id === e.id &&
                a.value.sha256 === e.sha256 &&
                (a.value.url ?? undefined) === e.url,
            )?.value;
            return {
              id: e.id,
              sha256: e.sha256,
              source: e.text,
              file: e.file,
              line_start: e.lineStart,
              line_end: e.lineEnd,
              provenance: e.provenance,
              url: e.url ?? null,
              repository: stored?.repository ?? null,
              commit: stored?.commit ?? null,
              git_blob_sha: stored?.gitBlobSha ?? null,
              source_bytes_base64:
                stored?.sourceBytesBase64 ??
                Buffer.from(e.text).toString("base64"),
              retrieved_at: stored?.retrievedAt ?? null,
            };
          }),
          run_results: {
            comparison: run.comparison,
            validation: decision.validation,
          },
        },
      })) as { zip_path: string };
      const zip = await readFile(result.zip_path);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="legacydiff-decision-${decision.version}.zip"`,
      );
      res.end(zip);
    } catch {
      res
        .writeHead(403, { "Content-Type": "text/plain" })
        .end("Export unavailable. Check access and the approved validation.");
    } finally {
      session?.connection.disconnect();
      activeExports--;
    }
  }).listen(runtime.workerPort, "127.0.0.1");
}
