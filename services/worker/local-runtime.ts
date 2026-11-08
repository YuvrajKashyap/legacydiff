/** Local instances may change ports, never the loopback trust boundary. */
export function localRuntime(env: Record<string, string | undefined>) {
  function port(name: string, fallback: number) {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
      throw new Error(`${name} must be a local port between 1024 and 65535.`);
    return Number(value);
  }
  const databasePort = port("LEGACYDIFF_DB_PORT", 3000);
  const workerPort = port("LEGACYDIFF_WORKER_PORT", 3001);
  const webPort = port("LEGACYDIFF_WEB_PORT", 5174);
  if (new Set([databasePort, workerPort, webPort]).size !== 3)
    throw new Error("Database, worker and frontend need distinct ports.");
  return {
    databaseUri: `ws://127.0.0.1:${databasePort}`,
    databaseHttp: `http://127.0.0.1:${databasePort}`,
    database: "legacydiff-local-v2",
    workerPort,
    origins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`],
  };
}
