import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { investigateSuite } from "./suite-investigation.ts";
import { createNvidiaTransport } from "./index.ts";
import type { ScenarioRun } from "../../packages/contracts/scenarios.ts";

const model = "nvidia/nemotron-3-ultra-550b-a55b";
const source = "Require manager approval.\nKeep audit history.\n";
const sha256 = createHash("sha256").update(source).digest("hex");
const run = {
  scenarioId: "permissions",
  manifest: {
    title: "Permissions",
    variants: [{ id: "program", source, sha256 }],
    evidence: [{ id: "policy", source, sha256 }],
    policies: [
      {
        id: "secure",
        label: "Keep approval",
        description: "Require manager",
        security_required: true,
      },
    ],
    dataset: {
      cases: [{ id: "boundary", input: { age_days: 30 } }],
      categories: ["boundary"],
    },
  },
  comparison: {
    cases: [{ id: "boundary", state: "mismatch", differences: ["approved"] }],
    mismatch_count: 1,
    error_count: 0,
  },
} as unknown as ScenarioRun;

function boundedText(label: string, length: number) {
  return (
    `${label}: ${"measured evidence ".repeat(length)}`.slice(0, length - 12) +
    " END-MARKER."
  );
}
function specialistFields(maximum = false) {
  return {
    recommendation: "DEFER",
    overview: maximum
      ? boundedText("Specialist overview", 250)
      : "The saved policy requires manager approval before access is granted.",
    findings: maximum
      ? [1, 2, 3].map((n) => boundedText(`Finding ${n}`, 240))
      : ["The reviewed source explicitly requires manager approval."],
    limits: maximum
      ? [1, 2].map((n) => boundedText(`Limit ${n}`, 180))
      : ["Only the supplied measured case was inspected by this specialist."],
    nextSteps: maximum
      ? [1, 2].map((n) => boundedText(`Specialist next step ${n}`, 180))
      : ["Ask the reviewer to confirm the intended approval policy."],
  };
}
function synthesisFields(maximum = false) {
  const section = (label: string) =>
    maximum
      ? [1, 2, 3].map((n) => boundedText(`${label} ${n}`, 300))
      : [
          `${label}: use the saved evidence and measured outputs before deciding.`,
        ];
  return {
    recommendation: "DEFER",
    overview: maximum
      ? boundedText("Combined overview", 400)
      : "The programs disagree on a measured case. Review the intended policy before approving any interpretation.",
    whatChanged: section("What changed"),
    businessImpact: section("Business impact"),
    independentRequirements: section("Independent requirements"),
    evidenceAndConflicts: section("Evidence and conflicts"),
    coverageLimits: section("Coverage limits"),
    nextSteps: section("Next steps"),
  };
}
function provider(
  invalidProposal = false,
  textOnlyRegression = false,
  maximum = false,
  omitRequiredSection = false,
) {
  let calls = 0;
  const transport = createNvidiaTransport({
    apiKey: "controlled-test-key",
    fetch: async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      const forced = request.tool_choice?.function?.name;
      const role = request.messages[0].content.match(
        /You are the (\w+) role/,
      )?.[1];
      if (
        role !== "orchestrator" &&
        !request.messages.some(
          (message: { role: string }) => message.role === "tool",
        )
      )
        assert.equal(
          forced,
          role === "policy" ? "read_artifact" : "inspect_case",
        );
      if (
        forced === "inspect_case" &&
        role === "regression" &&
        textOnlyRegression
      )
        return Response.json({
          model,
          choices: [
            {
              message: {
                role: "assistant",
                content: "I can explain this without using the required tool.",
                tool_calls: [],
              },
            },
          ],
        });
      const name = forced ?? "read_artifact";
      let args: unknown = { artifact_id: "policy" };
      if (forced === "inspect_case") args = { case_id: "boundary" };
      if (forced === "dispatch_specialists")
        args = {
          tasks: ["behavior", "policy", "regression"].map((role) => ({
            role,
            task: "Inspect policy source.",
          })),
        };
      if (forced === "submit_summary") {
        const allowed =
          request.tools[0].function.parameters.properties.citationIds.items
            .enum;
        assert.ok(allowed.includes("source-1-line-1"));
        assert.ok(allowed.includes("source-2-line-1"));
        args = {
          ...specialistFields(maximum),
          citationIds: ["source-2-line-1"],
        };
      }
      if (forced === "propose_policy") {
        const allowed =
          request.tools[0].function.parameters.properties.citationIds.items
            .enum;
        assert.ok(allowed.every((id: string) => id.startsWith("source-2-")));
        args = {
          policy_id: "secure",
          ...synthesisFields(maximum),
          citationIds: [
            invalidProposal ? "source-1-line-1" : "source-2-line-1",
          ],
        };
        if (omitRequiredSection)
          delete (args as { nextSteps?: string[] }).nextSteps;
      }
      return Response.json({
        model,
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call-${calls}`,
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            },
          },
        ],
      });
    },
  });
  return { transport, count: () => calls };
}
test("all four roles finish through forced summary tools and exact policy citation enums in eight real adapter calls", async () => {
  const controlled = provider();
  const result = await investigateSuite({
    run,
    modelId: model,
    apiKey: "test",
    transport: controlled.transport,
    signal: new AbortController().signal,
    onEvent: async () => {},
  });
  assert.equal(result.state, "completed");
  assert.equal(controlled.count(), 8);
  assert.equal(result.calls, 8);
  assert.equal(
    result.roles.filter((role) => role.state === "completed").length,
    4,
  );
  assert.deepEqual(result.proposals[0].citations, [
    {
      artifact_id: "policy",
      start_line: 1,
      end_line: 1,
      quote: "Require manager approval.",
    },
  ]);
});
test("maximum structured fields retain every section and final bullet without truncation", async () => {
  const controlled = provider(false, false, true);
  const result = await investigateSuite({
    run,
    modelId: model,
    apiKey: "test",
    transport: controlled.transport,
    signal: new AbortController().signal,
    onEvent: async () => {},
  });
  assert.equal(result.state, "completed");
  const specialist = result.roles.find(
    (item) => item.role === "behavior",
  )!.summary;
  assert.ok(specialist.length <= 2000);
  const expectedSpecialist = specialistFields(true);
  for (const value of [
    expectedSpecialist.overview,
    ...expectedSpecialist.findings,
    ...expectedSpecialist.limits,
    ...expectedSpecialist.nextSteps,
  ])
    assert.ok(
      specialist.includes(value),
      `Missing full specialist field: ${value.slice(0, 30)}`,
    );
  const conclusion = result.proposals[0].explanation;
  assert.ok(conclusion.length > 5000 && conclusion.length <= 8000);
  assert.equal(result.proposals[0].recommendation, "DEFER");
  assert.match(conclusion, /not approval to ship/);
  for (const title of [
    "What changed",
    "Business impact",
    "Independent requirements",
    "Evidence and conflicts",
    "Coverage and limits",
    "Next steps",
  ])
    assert.ok(conclusion.includes(`### ${title}\n\n- `));
  const expected = synthesisFields(true);
  for (const value of [
    expected.overview,
    ...expected.whatChanged,
    ...expected.businessImpact,
    ...expected.independentRequirements,
    ...expected.evidenceAndConflicts,
    ...expected.coverageLimits,
    ...expected.nextSteps,
  ])
    assert.ok(
      conclusion.includes(value),
      `Missing full conclusion field: ${value.slice(0, 30)}`,
    );
  assert.equal(
    result.roles.find((item) => item.role === "orchestrator")!.summary,
    conclusion,
  );
});
test("a synthesis missing a required next-steps section is not reported as completed", async () => {
  const controlled = provider(false, false, false, true);
  const result = await investigateSuite({
    run,
    modelId: model,
    apiKey: "test",
    transport: controlled.transport,
    signal: new AbortController().signal,
    onEvent: async () => {},
  });
  assert.equal(result.state, "partial");
  assert.equal(result.proposals.length, 0);
  assert.equal(
    result.roles.find((item) => item.role === "orchestrator")!.state,
    "failed",
  );
});
test("text-only gathering remains a failed role even when the provider ignores forced tool choice", async () => {
  const controlled = provider(false, true);
  const result = await investigateSuite({
    run,
    modelId: model,
    apiKey: "test",
    transport: controlled.transport,
    signal: new AbortController().signal,
    onEvent: async () => {},
  });
  assert.equal(result.state, "partial");
  assert.equal(
    result.roles.find((item) => item.role === "regression")?.state,
    "failed",
  );
  assert.equal(
    result.roles.find((item) => item.role === "regression")?.summary,
    "No genuine tool handoff",
  );
  assert.equal(controlled.count(), 7);
});
test("a provider cannot use a program-source citation to bypass the proposal evidence restriction", async () => {
  const controlled = provider(true);
  const result = await investigateSuite({
    run,
    modelId: model,
    apiKey: "test",
    transport: controlled.transport,
    signal: new AbortController().signal,
    onEvent: async () => {},
  });
  assert.equal(result.state, "partial");
  assert.equal(result.proposals.length, 0);
  assert.equal(
    result.roles.find((role) => role.role === "orchestrator")?.state,
    "failed",
  );
  assert.equal(
    result.roles.filter((role) => role.state === "completed").length,
    3,
  );
  assert.equal(controlled.count(), 8);
});
