import { z } from "zod";
import type { Run } from "./view-model";

export const agentRoles = [
  "orchestrator",
  "behavior",
  "policy",
  "regression",
] as const;
const roleSchema = z.enum(agentRoles);
const stateSchema = z.enum([
  "queued",
  "working",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);
const boundedText = z.string().max(24000);
const duration = z.number().finite().nonnegative();
const citationSchema = z.object({
  artifact_id: z.string().max(100),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  quote: boundedText,
});
const eventSchema = z.object({
  role: roleSchema,
  state: stateSchema,
  summary: boundedText,
  tool: z.string().max(100).optional(),
  durationMs: duration.optional(),
});
const roleResultSchema = z.object({
  state: stateSchema,
  summary: boundedText.optional(),
  reason: boundedText.optional(),
  durationMs: duration.optional(),
  citations: z.array(citationSchema).max(12).optional(),
});
const outcomeSchema = z.object({
  state: z.enum(["completed", "partial", "cancelled"]),
  requestedModelId: z.string().max(200),
  actualModelIds: z.array(z.string().max(200)).max(10),
  calls: z.number().int().nonnegative(),
  correctionCalls: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative().optional(),
  toolRequests: z.number().int().nonnegative(),
  distinctCases: z.number().int().nonnegative(),
  durationMs: duration,
  roles: z.object({
    orchestrator: roleResultSchema,
    behavior: roleResultSchema,
    policy: roleResultSchema,
    regression: roleResultSchema,
  }),
  events: z.array(eventSchema).max(200),
  proposals: z
    .array(
      z.object({
        finding_refs: z.array(z.string().max(100)).max(20),
        options: z
          .array(
            z.object({
              choice: z.enum(["include", "exclude"]),
              explanation: boundedText,
            }),
          )
          .length(2),
        evidence_refs: z.array(citationSchema).max(12),
      }),
    )
    .max(10),
});
export type AgentEvent = z.infer<typeof eventSchema>;
export type InvestigationOutcome = z.infer<typeof outcomeSchema>;
export type Citation = z.infer<typeof citationSchema>;

/** Read-only projection of confirmed activity. It never authorizes an operation. */
export function investigationPresentation(activity: Run["activity"]) {
  const events: AgentEvent[] = [];
  const ordinary: Run["activity"] = [];
  const chunks = new Map<number, string>();
  let total = 0,
    malformed = false,
    storedOutcome = false;
  let unreadableEvents = false;
  for (const item of activity) {
    if (item.label.startsWith("Investigation outcome:")) {
      storedOutcome = true;
      continue;
    }
    if (item.label.startsWith("Investigation JSON")) {
      const match = /^Investigation JSON (\d+)\/(\d+)\n([\s\S]*)$/.exec(
        item.label,
      );
      if (!match) {
        malformed = true;
        continue;
      }
      const index = Number(match[1]),
        count = Number(match[2]);
      if (
        index < 1 ||
        count < 1 ||
        count > 100 ||
        index > count ||
        (total && total !== count) ||
        chunks.has(index)
      )
        malformed = true;
      total = count;
      chunks.set(index, match[3]!);
      continue;
    }
    if (item.label.startsWith("{")) {
      const parsed = eventSchema.safeParse(parseJson(item.label));
      if (parsed.success) events.push(parsed.data);
      else unreadableEvents = true;
      continue;
    }
    ordinary.push(item);
  }
  let outcome: InvestigationOutcome | undefined;
  if (!malformed && total && chunks.size === total) {
    const text = Array.from({ length: total }, (_, i) =>
      chunks.get(i + 1),
    ).join("");
    if (text.length <= 190000) {
      const parsed = outcomeSchema.safeParse(parseJson(text));
      if (parsed.success) outcome = parsed.data;
    }
  }
  return {
    ordinary,
    events: outcome?.events ?? events,
    outcome,
    unreadableEvents,
    incomplete: (storedOutcome || total > 0 || malformed) && !outcome,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
