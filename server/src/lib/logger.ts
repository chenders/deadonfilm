import pino from "pino"
import type { Request } from "express"
import { mkdirSync, existsSync } from "fs"
import { dirname } from "path"

const isProduction = process.env.NODE_ENV === "production"
const logFilePath = process.env.LOG_FILE_PATH || "/var/log/deadonfilm/app.log"

// Track if file logging is actually available (set to false on directory creation failure)
let fileLoggingEnabled = process.env.LOG_TO_FILE === "true"

// Ensure log directory exists if file logging is requested
if (fileLoggingEnabled) {
  const logDir = dirname(logFilePath)
  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true })
    } catch (error) {
      // If we can't create the directory, disable file logging and fall back to stdout only
      console.error(`Failed to create log directory ${logDir}, disabling file logging:`, error)
      fileLoggingEnabled = false
    }
  }
}

/**
 * Build transport configuration based on environment.
 * - Production with file logging: multi-transport (stdout JSON + file)
 * - Production without file logging: stdout JSON only
 * - Development: pino-pretty for readable output
 */
function buildTransport(): pino.TransportSingleOptions | pino.TransportMultiOptions | undefined {
  if (!isProduction) {
    // Development: pretty-print to stdout
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    }
  }

  if (fileLoggingEnabled) {
    // Production with file logging: multi-transport
    return {
      targets: [
        {
          target: "pino/file",
          options: { destination: 1 }, // stdout (fd 1) for New Relic
          level: "info",
        },
        {
          target: "pino/file",
          options: { destination: logFilePath },
          level: "info",
        },
      ],
    }
  }

  // Production without file logging: default stdout JSON
  return undefined
}

/**
 * Structured logger with New Relic integration.
 * Pino is automatically instrumented by New Relic's Node.js agent,
 * enabling Logs in Context (trace correlation).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  transport: buildTransport(),
  // Base attributes included in every log
  base: {
    service: "dead-on-film",
    env: process.env.NODE_ENV || "development",
  },
  // Redact sensitive data
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "apiKey", "token"],
    censor: "[REDACTED]",
  },
})

/**
 * Log source types for categorization
 */
export type LogSource = "route" | "script" | "cronjob" | "middleware" | "startup" | "other"

/**
 * Create a child logger with additional context.
 * Useful for adding request-specific data.
 * @deprecated Use createRouteLogger for routes instead
 */
export function createRequestLogger(requestId: string, path: string) {
  return logger.child({
    requestId,
    path,
  })
}

/**
 * Create a logger with route/request context.
 * Includes requestId, path, method for request tracing.
 */
export function createRouteLogger(req: Request) {
  const requestId = (req.headers["x-request-id"] as string) || generateRequestId()
  return logger.child({
    source: "route" as LogSource,
    requestId,
    path: req.path,
    method: req.method,
  })
}

/**
 * Create a logger with script context.
 * Includes script name and process ID for script identification.
 */
export function createScriptLogger(scriptName: string) {
  return logger.child({
    source: "script" as LogSource,
    scriptName,
    pid: process.pid,
  })
}

/**
 * Create a logger with job context.
 * Includes job name, optional run ID, and queue information.
 * @param jobName - Name of the job
 * @param runId - Optional run identifier (numeric for enrichment runs, string for other jobs)
 */
export function createJobLogger(jobName: string, runId?: number | string) {
  return logger.child({
    source: "cronjob" as LogSource,
    jobName,
    ...(runId !== undefined && { runId }),
  })
}

/**
 * Create a logger with startup context.
 * Used for server initialization logging.
 */
export function createStartupLogger() {
  return logger.child({
    source: "startup" as LogSource,
  })
}

/**
 * Generate a simple request ID for tracing.
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Log levels:
 * - fatal: System is unusable
 * - error: Error conditions
 * - warn: Warning conditions
 * - info: Informational messages
 * - debug: Debug-level messages
 * - trace: Most detailed tracing
 */
export type Logger = typeof logger
