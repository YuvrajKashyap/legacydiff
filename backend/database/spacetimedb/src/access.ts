/**
 * Common permission and input checks for database operations.
 * Use the caller identity supplied by the server, never a name sent by the browser.
 */
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import db from "./schema";
import { reconcileRequest } from "../../../../packages/contracts/review";

export type Context = ReducerCtx<InferSchema<typeof db>>;
export function timestamp(ctx: Context) {
  return new Date(
    Number(ctx.timestamp.microsSinceUnixEpoch / 1000n),
  ).toISOString();
}
export function text(value: string, max = 2000) {
  if (!value.trim() || value.length > max)
    throw new SenderError("Text is empty or too long.");
  return value.trim();
}
/** Check the server-provided caller identity. A display name cannot grant access. */
export function requireMember(ctx: Context, roomId: string) {
  const member = ctx.db.membership.id.find(
    `${roomId}:${ctx.sender.toHexString()}`,
  );
  if (!member) throw new SenderError("Room access denied.");
  return member;
}
/** Allow only the registered private worker to take jobs or save execution results. */
export function requireWorker(ctx: Context) {
  const config = ctx.db.configuration.id.find("main");
  if (!config?.worker?.equals(ctx.sender))
    throw new SenderError("Worker authorization required.");
}
export function loadRun(ctx: Context, roomId: string, runId: string) {
  const room = ctx.db.room.id.find(roomId);
  const run = room?.runs.find((run) => run.id === runId);
  if (!room || !run) throw new SenderError("Comparison not found.");
  return { room, run };
}
export function request(
  ctx: Context,
  operation: string,
  id: string,
  payload: unknown,
) {
  text(id, 100);
  const key = `${ctx.sender.toHexString()}:${operation}:${id}`;
  const value = JSON.stringify(payload);
  try {
    if (reconcileRequest(ctx.db.receipt.id.find(key)?.payload, value))
      return true;
  } catch {
    throw new SenderError("Request ID already used with another payload.");
  }
  ctx.db.receipt.insert({ id: key, payload: value });
  return false;
}
