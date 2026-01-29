/**
 * Global error handling middleware.
 * Logs errors to pino and persists them to the database.
 */

import type { Request, Response, NextFunction } from "express"
import { createRouteLogger } from "../lib/logger.js"
import { persistLog } from "../lib/log-persistence.js"
import { getPool } from "../lib/db/pool.js"

/**
 * Express error handling middleware.
 * Must be registered after all routes.
 *
 * - Logs to pino (for New Relic and stdout)
 * - Persists to database (for admin logs UI)
 * - Returns generic error to client
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const routeLogger = createRouteLogger(req)
  const requestId = (req.headers["x-request-id"] as string) || undefined

  // Log to pino (picked up by New Relic)
  routeLogger.error({ err }, err.message)

  // Persist to database (fire-and-forget)
  // persistLog catches its own errors, so this won't throw
  const pool = getPool()
  persistLog(pool, {
    level: "error",
    source: "route",
    message: err.message,
    details: {
      name: err.name,
      ...(err.cause ? { cause: String(err.cause) } : {}),
    },
    requestId,
    path: req.path,
    method: req.method,
    errorStack: err.stack,
  })

  // Don't leak error details to client
  res.status(500).json({
    error: { message: "Internal server error" },
  })
}
