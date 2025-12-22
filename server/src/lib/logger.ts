import pino from "pino"

const isProduction = process.env.NODE_ENV === "production"

/**
 * Structured logger with New Relic integration.
 * Pino is automatically instrumented by New Relic's Node.js agent,
 * enabling Logs in Context (trace correlation).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  // In production, output JSON for New Relic ingestion
  // In development, use pino-pretty for readable output
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
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
 * Create a child logger with additional context.
 * Useful for adding request-specific data.
 */
export function createRequestLogger(requestId: string, path: string) {
  return logger.child({
    requestId,
    path,
  })
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
