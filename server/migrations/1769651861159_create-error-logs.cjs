/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Create error_logs table for storing application errors that can be viewed in the admin UI.
 * Only ERROR and FATAL level logs are persisted to the database.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create enum for log levels
  pgm.createType("log_level", ["fatal", "error", "warn", "info", "debug", "trace"])

  // Create enum for log sources
  pgm.createType("log_source", ["route", "script", "cronjob", "middleware", "startup", "other"])

  // Create error_logs table
  pgm.createTable("error_logs", {
    id: { type: "bigserial", primaryKey: true },
    level: { type: "log_level", notNull: true },
    source: { type: "log_source", notNull: true },
    message: { type: "text", notNull: true },
    details: { type: "jsonb" },
    request_id: { type: "text" },
    path: { type: "text" },
    method: { type: "text" },
    script_name: { type: "text" },
    job_name: { type: "text" },
    error_stack: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  // Create indexes for admin UI queries
  pgm.createIndex("error_logs", "created_at", { method: "btree", name: "idx_error_logs_created_at" })
  pgm.createIndex("error_logs", ["level", "created_at"], {
    method: "btree",
    name: "idx_error_logs_level_created",
  })
  pgm.createIndex("error_logs", ["source", "created_at"], {
    method: "btree",
    name: "idx_error_logs_source_created",
  })

  // Full-text search index on message
  pgm.sql(
    `CREATE INDEX idx_error_logs_message_gin ON error_logs USING gin (to_tsvector('english', message))`
  )
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("error_logs")
  pgm.dropType("log_source")
  pgm.dropType("log_level")
}
