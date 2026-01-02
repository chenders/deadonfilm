/**
 * Migration: Add date precision columns and batch response failures table
 *
 * 1. Add birthday_precision and deathday_precision columns to actors table
 *    to track whether we have year-only, year+month, or full date precision.
 *
 * 2. Add batch_response_failures table to store unparseable Claude batch
 *    responses for later reprocessing after code fixes.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add precision columns to actors table
  pgm.addColumns("actors", {
    birthday_precision: {
      type: "text",
      comment: "Precision of birthday: 'year', 'month', or 'day'. Null means 'day' (full precision).",
    },
    deathday_precision: {
      type: "text",
      comment: "Precision of deathday: 'year', 'month', or 'day'. Null means 'day' (full precision).",
    },
  })

  // Add check constraints for valid precision values
  pgm.addConstraint("actors", "birthday_precision_check", {
    check: "birthday_precision IN ('year', 'month', 'day') OR birthday_precision IS NULL",
  })

  pgm.addConstraint("actors", "deathday_precision_check", {
    check: "deathday_precision IN ('year', 'month', 'day') OR deathday_precision IS NULL",
  })

  // Create batch_response_failures table for storing unparseable responses
  pgm.createTable("batch_response_failures", {
    id: "id",
    batch_id: {
      type: "text",
      notNull: true,
      comment: "The Anthropic batch ID",
    },
    actor_id: {
      type: "integer",
      references: "actors(id)",
      onDelete: "CASCADE",
      comment: "The actor this response was about (if extractable)",
    },
    custom_id: {
      type: "text",
      notNull: true,
      comment: "The custom_id from the batch request (e.g., 'actor-12345')",
    },
    raw_response: {
      type: "text",
      notNull: true,
      comment: "The full Claude response text that failed to parse",
    },
    error_message: {
      type: "text",
      notNull: true,
      comment: "Description of what went wrong",
    },
    error_type: {
      type: "text",
      notNull: true,
      comment: "Category of error: 'json_parse', 'date_parse', 'validation', etc.",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    reprocessed_at: {
      type: "timestamp",
      comment: "Set when successfully reprocessed",
    },
    reprocessed_batch_id: {
      type: "text",
      comment: "Which reprocess run fixed this failure",
    },
  })

  // Add unique constraint on (batch_id, custom_id) for ON CONFLICT support
  pgm.addConstraint("batch_response_failures", "batch_response_failures_unique", {
    unique: ["batch_id", "custom_id"],
  })

  // Index for finding pending failures by batch
  pgm.createIndex("batch_response_failures", "batch_id", {
    name: "idx_batch_response_failures_batch_id",
  })

  // Partial index for finding unprocessed failures
  pgm.createIndex("batch_response_failures", "created_at", {
    name: "idx_batch_response_failures_pending",
    where: "reprocessed_at IS NULL",
  })

  // Index for looking up failures by actor
  pgm.createIndex("batch_response_failures", "actor_id", {
    name: "idx_batch_response_failures_actor_id",
    where: "actor_id IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop batch_response_failures table (cascade will handle constraint)
  pgm.dropTable("batch_response_failures", { cascade: true })

  // Drop constraints from actors
  pgm.dropConstraint("actors", "deathday_precision_check")
  pgm.dropConstraint("actors", "birthday_precision_check")

  // Drop precision columns from actors
  pgm.dropColumns("actors", ["birthday_precision", "deathday_precision"])
}
