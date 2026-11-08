import { DbConnection } from "./generated";
import { catalogFromWire, roomFromWire } from "../contracts/wire";
import type {
  Actions,
  Catalog,
  LegacyDiffState,
  Presence,
} from "../contracts/view-model";

const CATALOG_MAX_AGE_MS = 90_000;
type TokenStorage = Pick<Storage, "getItem" | "setItem">;
export interface ClientOptions {
  uri?: string;
  database?: string;
  workerUrl?: string;
  storage?: TokenStorage;
}

/** One browser identity and subscription lifecycle. There is deliberately no mutation replay queue. */
export function createLegacyDiffClient(options: ClientOptions = {}) {
  const uri = options.uri ?? "ws://127.0.0.1:3000";
  const database = options.database ?? "legacydiff-local-v2";
  const workerUrl = options.workerUrl ?? "http://127.0.0.1:3001";
  const storage =
    options.storage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);
  const tokenKey = `legacydiff.identity.v1:${uri}:${database}`;
  const listeners = new Set<() => void>();
  let connection: DbConnection | undefined;
  let subscribed = false;
  let stopped = true;
  let generation = 0;
  let token: string | undefined;
  let refreshScheduled = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let freshnessTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const update = (changes: Partial<LegacyDiffState>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  };
  function readyConnection(): DbConnection {
    if (!connection?.isActive || !subscribed || !snapshot.ready) {
      throw new Error(
        "Wait for a current authorized snapshot and a ready private worker before making changes.",
      );
    }
    return connection;
  }
  const actions: Actions = {
    async startComparison(input) {
      const current = readyConnection();
      if (!snapshot.catalog)
        throw new Error("The private worker catalog is unavailable.");
      if (
        input.withAi &&
        !snapshot.catalog.models.some(
          (model) => model.id === input.modelId && model.ready,
        )
      ) {
        throw new Error(
          "The selected model has not passed its live readiness check.",
        );
      }
      // IDs are derived from the same user-action request ID, so retries cannot create another room/run.
      const roomId = input.roomId ?? `room-${input.requestId}`;
      const runId = `run-${input.requestId}`;
      if (!input.roomId) {
        await current.reducers.createRoom({
          roomId,
          name: input.name,
          label: input.label,
          requestId: `create-${input.requestId}`,
        });
      }
      await readyConnection().reducers.startRun({
        roomId,
        runId,
        requestId: input.requestId,
        candidate: input.candidate,
        modelId: input.modelId,
        withAi: input.withAi,
      });
      return { roomId, runId };
    },
    async requestJoin(input) {
      await readyConnection().reducers.requestJoin(input);
    },
    async admitMember(input) {
      await readyConnection().reducers.admitMember(input);
    },
    async publishProposal(input) {
      await readyConnection().reducers.publishProposal(input);
    },
    async approveProposal(input) {
      await readyConnection().reducers.approveProposal(input);
    },
    async addComment(input) {
      await readyConnection().reducers.addComment(input);
    },
    async pinEvidence(input) {
      await readyConnection().reducers.pinEvidence(input);
    },
    async deferFinding(input) {
      await readyConnection().reducers.setReviewState({
        ...input,
        state: "deferred",
        text: "",
      });
    },
    async requestChanges(input) {
      await readyConnection().reducers.setReviewState({
        ...input,
        state: "needs_review",
      });
    },
    async cancelRun(input) {
      await readyConnection().reducers.cancelRun(input);
    },
    async exportBundle(input) {
      readyConnection();
      if (!token) throw new Error("The authenticated identity is unavailable.");
      const response = await fetch(`${workerUrl}/export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? "Export access denied for this identity."
            : "The review bundle could not be generated. Check the private worker and this decision version.",
        );
      }
      if (!response.headers.get("Content-Type")?.includes("application/zip"))
        throw new Error("The worker did not return a review ZIP bundle.");
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024)
        throw new Error("The review bundle exceeded the local download limit.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `legacydiff-${input.runId}-decision-${input.decisionVersion}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  let snapshot: LegacyDiffState = {
    ready: false,
    identity: "",
    error: "",
    rooms: [],
    requests: [],
    presence: [],
    catalog: null,
    actions,
  };

  function refresh() {
    if (!connection || stopped || !subscribed) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      browserOffline();
      return;
    }
    try {
      const rooms = [...connection.db.visibleRooms.iter()].map(roomFromWire);
      const requests = [...connection.db.visibleRequests.iter()].map((row) => ({
        id: row.id,
        roomId: row.roomId,
        identity: row.identity,
        label: row.label,
        state: row.state,
      }));
      const now = Date.now();
      const presentIdentities = new Set(
        [...connection.db.visiblePresence.iter()]
          .filter((row) => row.expiresAt > BigInt(now) * 1000n)
          .map((row) => row.identity),
      );
      const presence: Presence[] = rooms.flatMap((room) =>
        room.members
          .filter((member) => presentIdentities.has(member.identity))
          .map((member) => ({ roomId: room.id, identity: member.identity })),
      );
      const catalogRow = [...connection.db.catalog.iter()].find(
        (row) => row.id === "main",
      );
      const catalogAge = catalogRow
        ? now - Number(catalogRow.updatedAt / 1000n)
        : Infinity;
      const freshCatalog = Boolean(
        catalogRow && catalogAge >= -5000 && catalogAge < CATALOG_MAX_AGE_MS,
      );
      const catalog: Catalog | null =
        freshCatalog && catalogRow ? catalogFromWire(catalogRow.value) : null;
      update({
        rooms,
        requests,
        presence,
        catalog,
        ready: connection.isActive && freshCatalog,
        error: freshCatalog
          ? ""
          : "The private worker catalog is unavailable or stale. Start the worker and wait for its readiness update.",
      });
    } catch {
      update({
        ready: false,
        error:
          "The confirmed server snapshot could not be read. Check that client bindings match the published module.",
      });
    }
  }
  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      refresh();
    });
  }
  function heartbeat() {
    if (!connection?.isActive || !subscribed || stopped) return;
    void connection.reducers.heartbeat({}).catch(() => {
      if (!connection?.isActive)
        update({
          ready: false,
          error: "Connection lost. Waiting for the latest authorized snapshot.",
        });
    });
  }
  function rememberIdentity(identity: string, newToken: string) {
    token = newToken;
    try {
      storage?.setItem(tokenKey, newToken);
    } catch {
      update({
        error:
          "Browser storage is unavailable; this identity will not survive a reload.",
      });
    }
    update({ identity, ready: false });
  }
  function scheduleInitialRetry(attemptGeneration: number) {
    if (stopped || attemptGeneration !== generation || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!stopped && attemptGeneration === generation) openConnection();
    }, 3000);
  }
  function openConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      browserOffline();
      return;
    }
    const attemptGeneration = ++generation;
    subscribed = false;
    const previous = connection;
    connection = undefined;
    previous?.disconnect();
    update({ ready: false });
    const currentAttempt = () => !stopped && generation === attemptGeneration;
    try {
      token = token ?? storage?.getItem(tokenKey) ?? undefined;
      connection = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .withConfirmedReads(true)
        .withAutomaticReconnect({ minDelayMs: 1000, maxDelayMs: 10_000 })
        .onConnect((connected, identity, newToken) => {
          if (!currentAttempt()) {
            connected.disconnect();
            return;
          }
          rememberIdentity(identity.toHexString(), newToken);
          const tables = [
            connected.db.visibleRooms,
            connected.db.visibleRequests,
            connected.db.visiblePresence,
            connected.db.catalog,
          ];
          for (const table of tables) {
            table.onInsert(scheduleRefresh);
            table.onUpdate(scheduleRefresh);
            table.onDelete(scheduleRefresh);
          }
          connected
            .subscriptionBuilder()
            .onApplied(() => {
              if (!currentAttempt()) return;
              subscribed = true;
              refresh();
              heartbeat();
            })
            .onError(() => {
              if (!currentAttempt()) return;
              subscribed = false;
              update({
                ready: false,
                error:
                  "The authorized subscription failed. Check the published module and identity access.",
              });
            })
            .subscribe([
              "SELECT * FROM visible_rooms",
              "SELECT * FROM visible_requests",
              "SELECT * FROM visible_presence",
              "SELECT * FROM catalog",
            ]);
        })
        .onAutomaticReconnect((_connected, identity, newToken) => {
          if (!currentAttempt()) return;
          subscribed = false;
          rememberIdentity(identity.toHexString(), newToken);
          update({
            error: "Reconnected. Waiting for the current authorized snapshot.",
          });
        })
        .onConnectError((_context, _error, nextAttempt) => {
          if (!currentAttempt()) return;
          subscribed = false;
          update({
            ready: false,
            error:
              "Spacetime is unavailable or rejected this saved identity. Waiting to reconnect.",
          });
          if (nextAttempt === undefined)
            scheduleInitialRetry(attemptGeneration);
        })
        .onDisconnect((_context, _error, nextAttempt) => {
          if (!currentAttempt()) return;
          subscribed = false;
          update({
            ready: false,
            error:
              "Connection lost. Changes are disabled until a fresh authorized snapshot arrives.",
          });
          if (nextAttempt === undefined)
            scheduleInitialRetry(attemptGeneration);
        })
        .build();
    } catch {
      update({
        ready: false,
        error:
          "Unable to establish the saved Spacetime identity. Check browser storage and local server configuration.",
      });
      scheduleInitialRetry(attemptGeneration);
    }
  }
  function browserOffline() {
    generation++;
    subscribed = false;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    const previous = connection;
    connection = undefined;
    previous?.disconnect();
    update({
      ready: false,
      error:
        "Connection lost. Changes are disabled until a fresh authorized snapshot arrives.",
    });
  }
  function browserOnline() {
    if (!stopped) openConnection();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect() {
      if (!stopped) return;
      stopped = false;
      if (typeof window !== "undefined") {
        window.addEventListener("offline", browserOffline);
        window.addEventListener("online", browserOnline);
      }
      openConnection();
      heartbeatTimer = setInterval(heartbeat, 30_000);
      freshnessTimer = setInterval(refresh, 5000);
    },
    disconnect() {
      stopped = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("offline", browserOffline);
        window.removeEventListener("online", browserOnline);
      }
      generation++;
      subscribed = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (freshnessTimer) clearInterval(freshnessTimer);
      retryTimer = undefined;
      heartbeatTimer = undefined;
      freshnessTimer = undefined;
      connection?.disconnect();
      connection = undefined;
      update({ ready: false });
    },
  };
}

export type LegacyDiffClient = ReturnType<typeof createLegacyDiffClient>;
