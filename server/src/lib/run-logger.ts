/**
 * RunLogger — buffers structured log entries and batch-inserts them into
 * the `run_logs` table. Both death and biography enrichment orchestrators
 * create an instance at run start and call flush() at the end.
 *
 * Logs are also written to console so Docker/process logs still work.
 */

import { getPool } from "./db/pool.js"

interface LogEntry {
  timestamp: Date
  level: string
  message: string
  data: Record<string, unknown> | null
  source: string | null
}

interface RunLoggerOptions {
  /** Number of buffered entries before auto-flush (default 50) */
  flushThreshold?: number
}

export class RunLogger {
  private buffer: LogEntry[] = []
  private readonly runType: string
  private readonly runId: number
  private readonly flushThreshold: number

  constructor(runType: "death" | "biography", runId: number, options?: RunLoggerOptions) {
    this.runType = runType
    this.runId = runId
    this.flushThreshold = options?.flushThreshold ?? 50
  }

  /** Log an informational message */
  info(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("info", message, data, source)
  }

  /** Log a warning message */
  warn(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("warn", message, data, source)
  }

  /** Log an error message */
  error(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("error", message, data, source)
  }

  /** Log a debug message */
  debug(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("debug", message, data, source)
  }

  private log(level: string, message: string, data?: Record<string, unknown>, source?: string): void {
    const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "debug" ? "DEBUG" : "INFO"
    const dataStr = data ? ` ${JSON.stringify(data)}` : ""
    console.log(`[${this.runType}:${this.runId}] [${prefix}] ${message}${dataStr}`)

    this.buffer.push({
      timestamp: new Date(),
      level,
      message,
      data: data ?? null,
      source: source ?? null,
    })

    if (this.buffer.length >= this.flushThreshold) {
      void this.flush()
    }
  }

  /** Flush all buffered entries to the database */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const entries = this.buffer.splice(0)
    const pool = getPool()

    const timestamps = entries.map((e) => e.timestamp.toISOString())
    const levels = entries.map((e) => e.level)
    const messages = entries.map((e) => e.message)
    const dataArr = entries.map((e) => (e.data ? JSON.stringify(e.data) : null))
    const sources = entries.map((e) => e.source)

    try {
      await pool.query(
        `INSERT INTO run_logs (run_type, run_id, timestamp, level, message, data, source)
         SELECT $1, $2, t.ts::timestamptz, t.lvl, t.msg,
                CASE WHEN t.d IS NOT NULL THEN t.d::jsonb ELSE NULL END,
                t.src
         FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
           AS t(ts, lvl, msg, d, src)`,
        [this.runType, this.runId, timestamps, levels, messages, dataArr, sources]
      )
    } catch (err) {
      console.error("[RunLogger] Failed to flush logs:", err)
    }
  }
}
