/**
 * Log persistence module for storing error logs to the database.
 * Only ERROR and FATAL level logs are persisted.
 */

import type { Pool } from "pg"
import type { LogSource } from "./logger.js"

/**
 * Log entry structure for database persistence
 */
export interface LogEntry {
  level: "fatal" | "error" | "warn" | "info" | "debug" | "trace"
  source: LogSource
  message: string
  details?: Record<string, unknown>
  requestId?: string
  path?: string
  method?: string
  scriptName?: string
  jobName?: string
  runId?: number
  errorStack?: string
}

/**
 * Levels that should be persisted to the database
 */
const PERSIST_LEVELS = new Set(["fatal", "error"])

/**
 * Persist a log entry to the database.
 * Only persists ERROR and FATAL levels.
 * This function is async but fire-and-forget - callers don't need to await.
 *
 * @param pool - Database connection pool
 * @param entry - Log entry to persist
 */
export async function persistLog(pool: Pool, entry: LogEntry): Promise<void> {
  // Only persist error and fatal logs
  if (!PERSIST_LEVELS.has(entry.level)) {
    return
  }

  try {
    await pool.query(
      `INSERT INTO error_logs (
        level, source, message, details, request_id, path, method,
        script_name, job_name, run_id, error_stack
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.level,
        entry.source,
        entry.message,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.requestId || null,
        entry.path || null,
        entry.method || null,
        entry.scriptName || null,
        entry.jobName || null,
        entry.runId || null,
        entry.errorStack || null,
      ]
    )
  } catch (dbError) {
    // Log to console as fallback - don't throw to avoid disrupting application flow
    console.error("Failed to persist log entry to database:", dbError)
  }
}

/**
 * Persist a log entry to the database (required version).
 * Throws if persistence fails - use in scripts where logging must succeed.
 *
 * @param pool - Database connection pool
 * @param entry - Log entry to persist
 * @throws Error if persistence fails
 */
export async function persistLogRequired(pool: Pool, entry: LogEntry): Promise<void> {
  // Only persist error and fatal logs
  if (!PERSIST_LEVELS.has(entry.level)) {
    return
  }

  await pool.query(
    `INSERT INTO error_logs (
      level, source, message, details, request_id, path, method,
      script_name, job_name, run_id, error_stack
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.level,
      entry.source,
      entry.message,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.requestId || null,
      entry.path || null,
      entry.method || null,
      entry.scriptName || null,
      entry.jobName || null,
      entry.runId || null,
      entry.errorStack || null,
    ]
  )
}

/**
 * Extract log entry from a Pino log object.
 * Used to convert Pino log format to database entry format.
 */
export function extractLogEntry(
  pinoLog: Record<string, unknown>,
  message: string
): Partial<LogEntry> {
  const entry: Partial<LogEntry> = {
    message,
    source: (pinoLog.source as LogSource) || "other",
  }

  if (pinoLog.requestId) entry.requestId = pinoLog.requestId as string
  if (pinoLog.path) entry.path = pinoLog.path as string
  if (pinoLog.method) entry.method = pinoLog.method as string
  if (pinoLog.scriptName) entry.scriptName = pinoLog.scriptName as string
  if (pinoLog.jobName) entry.jobName = pinoLog.jobName as string

  // Handle runId (can be number or string, convert to number for database)
  if (pinoLog.runId !== undefined) {
    const numericRunId =
      typeof pinoLog.runId === "number" ? pinoLog.runId : parseInt(pinoLog.runId as string, 10)
    if (!isNaN(numericRunId)) {
      entry.runId = numericRunId
    }
  }

  // Extract error stack from error objects
  if (pinoLog.error && typeof pinoLog.error === "object") {
    const err = pinoLog.error as { stack?: string }
    if (err.stack) entry.errorStack = err.stack
  }

  // Collect remaining fields as details (excluding standard pino fields)
  const standardFields = new Set([
    "level",
    "time",
    "pid",
    "hostname",
    "msg",
    "service",
    "env",
    "source",
    "requestId",
    "path",
    "method",
    "scriptName",
    "jobName",
    "runId",
    "error",
  ])

  const details: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(pinoLog)) {
    if (!standardFields.has(key)) {
      details[key] = value
    }
  }

  if (Object.keys(details).length > 0) {
    entry.details = details
  }

  return entry
}
