/**
 * Text-based logger for death enrichment with Apache-style rotation and gzip compression.
 *
 * Features:
 * - All logs kept forever (older logs compressed with gzip)
 * - Configurable rotation size via JSON config file
 * - Syslog-inspired format for easy parsing
 * - Easy viewing with `tail -f` during enrichment runs
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  WriteStream,
  createReadStream,
} from "fs"
import { createGzip } from "zlib"
import { pipeline } from "stream/promises"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { parse as parseIni } from "ini"
import { DataSourceType } from "./types.js"

// ============================================================================
// Configuration Types
// ============================================================================

export interface LogConfig {
  /** Directory for log files (relative to server/) */
  directory: string
  /** Base filename for logs */
  filename: string
  /** Size in bytes that triggers rotation (default: 10MB) */
  rotationSizeBytes: number
  /** Whether to compress rotated logs with gzip (default: true) */
  compressRotated: boolean
  /** Log level: debug, info, warn, error (default: info) */
  level: LogLevel
}

export type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const DEFAULT_CONFIG: LogConfig = {
  directory: "logs/death-enrichment",
  filename: "enrichment.log",
  rotationSizeBytes: 10 * 1024 * 1024, // 10MB
  compressRotated: true,
  level: "info",
}

// ============================================================================
// Logger Implementation
// ============================================================================

export class EnrichmentLogger {
  private stream: WriteStream | null = null
  private currentSize: number = 0
  private config: LogConfig
  private baseDir: string
  private isRotating: boolean = false

  constructor(config: Partial<LogConfig> = {}, baseDir?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    // Resolve base directory (server directory)
    this.baseDir = baseDir || resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
  }

  /**
   * Create logger from an .ini config file.
   * Falls back to defaults if file doesn't exist.
   */
  static fromConfigFile(configPath?: string, baseDir?: string): EnrichmentLogger {
    const resolvedBaseDir = baseDir || resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
    // nosemgrep: path-join-resolve-traversal - path is not user-controlled
    const defaultPath = join(resolvedBaseDir, "config/enrichment-logging.ini")
    const path = configPath || defaultPath

    let config: Partial<LogConfig> = {}
    if (existsSync(path)) {
      try {
        const fileContent = readFileSync(path, "utf-8")
        const parsed = parseIni(fileContent) as {
          logging?: {
            directory?: string
            filename?: string
            rotation_size_bytes?: string
            compress_rotated?: string
            level?: string
          }
        }
        const logging = parsed.logging || {}
        config = {
          directory: logging.directory,
          filename: logging.filename,
          rotationSizeBytes: logging.rotation_size_bytes
            ? parseInt(logging.rotation_size_bytes, 10)
            : undefined,
          compressRotated: logging.compress_rotated !== "false",
          level: logging.level as LogLevel | undefined,
        }
      } catch {
        // Silently fall back to defaults
      }
    }

    return new EnrichmentLogger(config, resolvedBaseDir)
  }

  /**
   * Get the full path to the log directory.
   */
  get logDirectory(): string {
    return join(this.baseDir, this.config.directory)
  }

  /**
   * Get the full path to the current log file.
   */
  get logFilePath(): string {
    return join(this.logDirectory, this.config.filename)
  }

  // ==========================================================================
  // Public Logging Methods
  // ==========================================================================

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data)
  }

  error(message: string, error?: Error | null, data?: Record<string, unknown>): void {
    const errorData = error
      ? {
          ...data,
          error_name: error.name,
          error_message: error.message,
          error_stack: error.stack?.split("\n").slice(0, 3).join(" | "),
        }
      : data
    this.log("error", message, errorData)
  }

  // ==========================================================================
  // Enrichment-Specific Logging Methods
  // ==========================================================================

  /**
   * Log when attempting to fetch from a source.
   */
  sourceAttempt(actorName: string, source: DataSourceType, url: string): void {
    this.info("[ATTEMPT]", { actor: actorName, source, url })
  }

  /**
   * Log when a source returns data successfully.
   */
  sourceSuccess(actorName: string, source: DataSourceType, fieldsFound: string[]): void {
    this.info("[SUCCESS]", { actor: actorName, source, fields: fieldsFound })
  }

  /**
   * Log when a source is blocked (403, rate limited, etc.)
   */
  sourceBlocked(actorName: string, source: DataSourceType, statusCode: number, url: string): void {
    this.warn("[BLOCKED]", { actor: actorName, source, status: statusCode, url })
  }

  /**
   * Log when a source fails with an error.
   */
  sourceFailed(actorName: string, source: DataSourceType, errorMessage: string): void {
    this.warn("[FAILED]", { actor: actorName, source, error: errorMessage })
  }

  /**
   * Log when enrichment completes for an actor.
   */
  enrichmentComplete(
    actorId: number,
    actorName: string,
    totalSources: number,
    successSources: number,
    costUsd?: number
  ): void {
    this.info("[COMPLETE]", {
      actor_id: actorId,
      actor: actorName,
      sources_tried: totalSources,
      sources_succeeded: successSources,
      cost_usd: costUsd,
    })
  }

  /**
   * Log batch start.
   */
  batchStart(totalActors: number): void {
    this.info("[BATCH_START]", { total_actors: totalActors })
  }

  /**
   * Log batch completion.
   */
  batchComplete(
    actorsProcessed: number,
    actorsEnriched: number,
    totalCostUsd: number,
    totalTimeMs: number
  ): void {
    this.info("[BATCH_COMPLETE]", {
      actors_processed: actorsProcessed,
      actors_enriched: actorsEnriched,
      fill_rate:
        actorsProcessed > 0 ? ((actorsEnriched / actorsProcessed) * 100).toFixed(1) + "%" : "0%",
      total_cost_usd: totalCostUsd.toFixed(4),
      total_time_ms: totalTimeMs,
    })
  }

  /**
   * Log Claude cleanup request (prompt sent to Claude).
   */
  logClaudeCleanupRequest(
    actorId: number,
    actorName: string,
    sourceCount: number,
    prompt: string
  ): void {
    this.debug("[CLAUDE_REQUEST]", {
      actor_id: actorId,
      actor: actorName,
      sources: sourceCount,
    })
    // Log the full prompt on a separate line for easy reading
    this.debug("[CLAUDE_PROMPT]", {
      prompt: prompt.substring(0, 2000) + (prompt.length > 2000 ? "..." : ""),
    })
  }

  /**
   * Log Claude cleanup response.
   */
  logClaudeCleanupResponse(
    actorId: number,
    actorName: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
    response: string
  ): void {
    this.info("[CLAUDE_RESPONSE]", {
      actor_id: actorId,
      actor: actorName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd.toFixed(4),
    })
    // Log the full response on a separate line for easy reading
    this.debug("[CLAUDE_OUTPUT]", {
      response: response.substring(0, 3000) + (response.length > 3000 ? "..." : ""),
    })
  }

  // ==========================================================================
  // Internal Implementation
  // ==========================================================================

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Skip if below configured log level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return
    }

    const timestamp = new Date().toISOString()
    const levelUpper = level.toUpperCase().padEnd(5)
    const dataStr = data ? " " + this.formatData(data) : ""
    const line = `${timestamp} ${levelUpper} ${message}${dataStr}\n`

    this.writeLine(line)
  }

  private formatData(data: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        parts.push(`${key}=${JSON.stringify(value)}`)
      } else if (typeof value === "string" && value.includes(" ")) {
        parts.push(`${key}="${value}"`)
      } else {
        parts.push(`${key}=${value}`)
      }
    }
    return parts.join(" ")
  }

  private writeLine(line: string): void {
    this.ensureStream()
    if (!this.stream) return

    const bytes = Buffer.byteLength(line, "utf-8")
    this.stream.write(line)
    this.currentSize += bytes

    // Check if rotation is needed (async, don't await)
    if (this.currentSize >= this.config.rotationSizeBytes && !this.isRotating) {
      this.rotate().catch(() => {
        // Rotation errors are non-fatal
      })
    }
  }

  private ensureStream(): void {
    if (this.stream) return

    // Ensure directory exists
    if (!existsSync(this.logDirectory)) {
      mkdirSync(this.logDirectory, { recursive: true })
    }

    // Open stream, get current size if file exists
    const logPath = this.logFilePath
    if (existsSync(logPath)) {
      try {
        const stats = statSync(logPath)
        this.currentSize = stats.size
      } catch {
        this.currentSize = 0
      }
    }

    this.stream = createWriteStream(logPath, { flags: "a" })
    this.stream.on("error", () => {
      // Handle stream errors silently - logging shouldn't crash the app
      this.stream = null
    })
  }

  private async rotate(): Promise<void> {
    if (this.isRotating) return
    this.isRotating = true

    try {
      // Close current stream
      if (this.stream) {
        this.stream.end()
        this.stream = null
      }

      const logPath = this.logFilePath
      if (!existsSync(logPath)) {
        this.isRotating = false
        return
      }

      // Generate timestamp-based name
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const rotatedName = `${this.config.filename}.${timestamp}`
      const rotatedPath = join(this.logDirectory, rotatedName)

      // Rename current log
      renameSync(logPath, rotatedPath)

      // Compress if configured
      if (this.config.compressRotated) {
        await this.compressFile(rotatedPath)
      }

      // Reset size counter
      this.currentSize = 0
    } finally {
      this.isRotating = false
    }
  }

  private async compressFile(filepath: string): Promise<void> {
    const gzip = createGzip()
    const source = createReadStream(filepath)
    const destination = createWriteStream(`${filepath}.gz`)

    try {
      await pipeline(source, gzip, destination)
      // Remove uncompressed file after successful gzip
      unlinkSync(filepath)
    } catch {
      // If compression fails, keep the uncompressed file
    }
  }

  /**
   * Close the logger stream. Call when done logging.
   * Returns a promise that resolves when the stream is fully flushed.
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          this.stream = null
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultLogger: EnrichmentLogger | null = null

/**
 * Get the default logger instance (lazy initialized from config file).
 */
export function getEnrichmentLogger(): EnrichmentLogger {
  if (!defaultLogger) {
    defaultLogger = EnrichmentLogger.fromConfigFile()
  }
  return defaultLogger
}

/**
 * Set a custom default logger (useful for testing).
 */
export function setEnrichmentLogger(logger: EnrichmentLogger): void {
  defaultLogger = logger
}
