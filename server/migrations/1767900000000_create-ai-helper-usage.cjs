/**
 * Migration: Create ai_helper_usage table
 *
 * Tracks AI model usage for link selection and content extraction.
 * Enables data-driven model selection by recording:
 * - Token usage and costs per operation
 * - Latency metrics
 * - Quality outcomes (set by downstream validation)
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("ai_helper_usage", {
    id: "id",

    // Actor reference
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors(id)",
      onDelete: "CASCADE",
      comment: "Actor this AI call was for",
    },

    // AI model identification
    model: {
      type: "text",
      notNull: true,
      comment: "Model identifier (e.g., claude-sonnet-4-20250514)",
    },
    operation: {
      type: "text",
      notNull: true,
      comment: "Operation type: link_selection, content_extraction, cleanup",
    },

    // Token usage
    input_tokens: {
      type: "integer",
      notNull: true,
      comment: "Number of input tokens consumed",
    },
    output_tokens: {
      type: "integer",
      notNull: true,
      comment: "Number of output tokens generated",
    },

    // Cost and performance
    cost_usd: {
      type: "decimal(10,6)",
      notNull: true,
      comment: "Cost in USD for this call",
    },
    latency_ms: {
      type: "integer",
      notNull: true,
      comment: "API call latency in milliseconds",
    },

    // Quality metrics (set by downstream validation)
    result_quality: {
      type: "text",
      comment: "Quality rating: high, medium, low (set after validation)",
    },
    circumstances_length: {
      type: "integer",
      comment: "Length of circumstances text (if extracted)",
    },
    notable_factors_count: {
      type: "integer",
      comment: "Number of notable factors found",
    },
    has_location: {
      type: "boolean",
      default: false,
      comment: "Whether location of death was found",
    },

    // Timestamp
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("NOW()"),
      comment: "When this AI call was made",
    },
  })

  // Index for model comparison queries
  pgm.createIndex("ai_helper_usage", "model", {
    name: "idx_ai_usage_model",
  })

  // Index for operation-specific analysis
  pgm.createIndex("ai_helper_usage", "operation", {
    name: "idx_ai_usage_operation",
  })

  // Index for time-based queries
  pgm.createIndex("ai_helper_usage", "created_at", {
    name: "idx_ai_usage_created_at",
  })

  // Index for finding usage by actor
  pgm.createIndex("ai_helper_usage", "actor_id", {
    name: "idx_ai_usage_actor_id",
  })

  // Index for quality analysis
  pgm.createIndex("ai_helper_usage", "result_quality", {
    name: "idx_ai_usage_quality",
    where: "result_quality IS NOT NULL",
  })

  // Composite index for model + operation analysis
  pgm.createIndex("ai_helper_usage", ["model", "operation"], {
    name: "idx_ai_usage_model_operation",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("ai_helper_usage", { cascade: true })
}
