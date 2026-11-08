/** Connects with the supplied login and waits until the first set of allowed records arrives. */
import { localRuntime } from "./local-runtime";
import { DbConnection } from "../../packages/client/generated";

const runtime = localRuntime(process.env);

export async function connectDatabase(
  token?: string,
  worker = false,
): Promise<{ connection: DbConnection; token: string; identity: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending?.disconnect();
      reject(new Error("Spacetime connection timed out."));
    }, 10000);
    const pending = DbConnection.builder()
      .withUri(runtime.databaseUri)
      .withDatabaseName(runtime.database)
      .withToken(token)
      .onConnect((connection, identity, issuedToken) => {
        connection
          .subscriptionBuilder()
          // A connected socket alone is not enough: wait for the allowed records.
          .onApplied(() => {
            clearTimeout(timer);
            resolve({
              connection,
              token: issuedToken,
              identity: identity.toHexString(),
            });
          })
          .onError((ctx) => {
            clearTimeout(timer);
            connection.disconnect();
            reject(ctx.event);
          })
          .subscribe(
            worker
              ? [
                  "SELECT * FROM worker_suite_jobs",
                  "SELECT * FROM worker_suite_runs",
                  "SELECT * FROM worker_jobs",
                  "SELECT * FROM worker_rooms",
                  "SELECT * FROM catalog",
                  "SELECT * FROM artifact_snapshot",
                ]
              : [
                  "SELECT * FROM visible_suite_runs",
                  "SELECT * FROM visible_rooms",
                  "SELECT * FROM visible_requests",
                  "SELECT * FROM visible_presence",
                  "SELECT * FROM catalog",
                  "SELECT * FROM artifact_snapshot",
                ],
          );
      })
      .onConnectError((_ctx, error) => {
        clearTimeout(timer);
        reject(error);
      })
      .build();
  });
}
