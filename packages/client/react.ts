import { useEffect, useState, useSyncExternalStore } from "react";
import { createLegacyDiffClient } from "./connection";
import type { LegacyDiffState } from "../contracts/view-model";

/** React owns only the connection lifecycle; selections and unsent drafts stay in the UI. */
export function useLegacyDiff(): LegacyDiffState {
  const [client] = useState(() =>
    createLegacyDiffClient({
      uri: import.meta.env.VITE_SPACETIME_URI || "ws://127.0.0.1:3000",
      database:
        import.meta.env.VITE_SPACETIME_DATABASE || "legacydiff-local-v2",
      workerUrl: import.meta.env.VITE_WORKER_URL || "http://127.0.0.1:3001",
    }),
  );
  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
}
