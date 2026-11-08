import { t, SenderError } from "spacetimedb/server";
import db, { room, joinRequest, presence } from "./schema";
import { request, text } from "./access";

export const createRoom = db.reducer(
  {
    roomId: t.string(),
    name: t.string(),
    label: t.string(),
    requestId: t.string(),
  },
  (ctx, args) => {
    if (request(ctx, "create", args.requestId, args)) return;
    text(args.roomId, 100);
    if ([...ctx.db.membership.identity.filter(ctx.sender)].length >= 30)
      throw new SenderError("Local demo room limit reached.");
    const identity = ctx.sender.toHexString();
    ctx.db.room.insert({
      id: args.roomId,
      name: text(args.name, 100),
      owner: identity,
      members: [{ identity, label: text(args.label, 60), role: "reviewer" }],
      runs: [],
    });
    ctx.db.membership.insert({
      id: `${args.roomId}:${identity}`,
      roomId: args.roomId,
      identity: ctx.sender,
      role: "reviewer",
    });
  },
);

export const requestJoin = db.reducer(
  { roomId: t.string(), label: t.string() },
  (ctx, args) => {
    if (!ctx.db.room.id.find(args.roomId))
      throw new SenderError("Room unavailable.");
    const identity = ctx.sender.toHexString(),
      id = `${args.roomId}:${identity}`;
    if (ctx.db.membership.id.find(id)) return;
    const row = {
      id,
      roomId: args.roomId,
      identity,
      principal: ctx.sender,
      label: text(args.label, 60),
      state: "pending",
    };
    if (ctx.db.joinRequest.id.find(id)) ctx.db.joinRequest.id.update(row);
    else ctx.db.joinRequest.insert(row);
  },
);

export const admitMember = db.reducer(
  { requestId: t.string(), role: t.string() },
  (ctx, args) => {
    if (!["engineer", "reviewer"].includes(args.role))
      throw new SenderError("Invalid role.");
    const pending = ctx.db.joinRequest.id.find(args.requestId);
    if (!pending) throw new SenderError("Admission request not found.");
    const current = ctx.db.room.id.find(pending.roomId);
    if (!current || current.owner !== ctx.sender.toHexString())
      throw new SenderError("Only the room owner can admit participants.");
    if (pending.state !== "pending") return;
    if (current.members.length >= 10)
      throw new SenderError("Local room participant limit reached.");
    // The identity comes from a server-recorded request, never a role selector.
    const identity = pending.principal;
    ctx.db.membership.insert({
      id: pending.id,
      roomId: pending.roomId,
      identity,
      role: args.role,
    });
    current.members.push({
      identity: pending.identity,
      label: pending.label,
      role: args.role,
    });
    ctx.db.room.id.update(current);
    ctx.db.joinRequest.id.update({ ...pending, state: "admitted" });
  },
);

export const visibleRooms = db.view(
  { name: "visible_rooms", public: true },
  t.array(room.rowType),
  (ctx) => {
    const ids = [...ctx.db.membership.identity.filter(ctx.sender)].map(
      (row) => row.roomId,
    );
    return ids.flatMap((id) => {
      const found = ctx.db.room.id.find(id);
      return found ? [found] : [];
    });
  },
);
export const visibleRequests = db.view(
  { name: "visible_requests", public: true },
  t.array(joinRequest.rowType),
  (ctx) =>
    [...ctx.db.joinRequest.iter()].filter(
      (row) =>
        row.identity === ctx.sender.toHexString() ||
        ctx.db.room.id.find(row.roomId)?.owner === ctx.sender.toHexString(),
    ),
);
export const visiblePresence = db.view(
  { name: "visible_presence", public: true },
  t.array(presence.rowType),
  (ctx) => {
    const people = new Set(
      [...ctx.db.membership.identity.filter(ctx.sender)].flatMap(
        (m) =>
          ctx.db.room.id.find(m.roomId)?.members.map((p) => p.identity) ?? [],
      ),
    );
    return [...ctx.db.presence.iter()].filter((p) => people.has(p.identity));
  },
);
export const heartbeat = db.reducer((ctx) => {
  if (!ctx.connectionId) return;
  const row = {
    id: ctx.connectionId.toHexString(),
    identity: ctx.sender.toHexString(),
    expiresAt: ctx.timestamp.microsSinceUnixEpoch + 90_000_000n,
  };
  if (ctx.db.presence.id.find(row.id)) ctx.db.presence.id.update(row);
  else ctx.db.presence.insert(row);
});
export const disconnected = db.clientDisconnected((ctx) => {
  if (ctx.connectionId)
    ctx.db.presence.id.delete(ctx.connectionId.toHexString());
});
