/**
 * Synchronous Redis connectivity probe for integration test skip guards.
 *
 * describe.skipIf() requires a synchronous boolean, so we spawn a short-lived
 * Node subprocess that attempts a TCP connection to the Redis host/port.
 */

import { spawnSync } from "node:child_process"

/** Returns true only if REDIS_JOBS_URL is set AND the host is reachable. */
export function isRedisReachable(): boolean {
  if (!process.env.REDIS_JOBS_URL) return false

  try {
    const url = new URL(process.env.REDIS_JOBS_URL)
    const host = url.hostname || "localhost"
    const port = url.port || "6379"

    const result = spawnSync(
      "node",
      [
        "-e",
        `const s=require("net").createConnection(${port},"${host}");` +
          `s.on("connect",()=>{s.end();process.exit(0)});` +
          `s.on("error",()=>process.exit(1));` +
          `setTimeout(()=>process.exit(1),2000);`,
      ],
      { timeout: 3000 }
    )

    return result.status === 0
  } catch {
    return false
  }
}
