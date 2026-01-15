/**
 * Migration: Create source_query_cache table
 *
 * Stores all API responses from death enrichment sources to prevent
 * duplicate queries and enable offline analysis/reprocessing.
 *
 * Features:
 * - SHA256 hash for fast cache lookups
 * - Separate columns for small JSON responses and compressed large responses
 * - Cost tracking per query for budget monitoring
 * - Response time tracking for source performance analysis
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("source_query_cache", {
    id: "id",

    // Source identification
    source_type: {
      type: "text",
      notNull: true,
      comment: "DataSourceType enum value (e.g., wikidata, wikipedia, deepseek)",
    },

    // Actor reference (nullable for non-actor-specific queries)
    actor_id: {
      type: "integer",
      references: "actors(id)",
      onDelete: "SET NULL",
      comment: "Reference to actor this query was for",
    },

    // Query identification
    query_string: {
      type: "text",
      notNull: true,
      comment: "Exact query/URL/prompt sent to the source",
    },
    query_hash: {
      type: "text",
      notNull: true,
      comment: "SHA256 hash of source_type + query_string for fast lookup",
    },

    // Response data
    response_status: {
      type: "integer",
      comment: "HTTP status code or API response code (200, 404, 403, etc.)",
    },
    response_raw: {
      type: "jsonb",
      comment: "Response data for small responses (<50KB)",
    },
    response_compressed: {
      type: "bytea",
      comment: "gzip-compressed response for large responses",
    },
    is_compressed: {
      type: "boolean",
      notNull: true,
      default: false,
      comment: "True if response is stored in response_compressed",
    },
    response_size_bytes: {
      type: "integer",
      comment: "Original uncompressed size in bytes",
    },

    // Error tracking
    error_message: {
      type: "text",
      comment: "Error message if request failed",
    },

    // Performance metrics
    queried_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("NOW()"),
      comment: "When the query was made",
    },
    response_time_ms: {
      type: "integer",
      comment: "Time taken for the request in milliseconds",
    },

    // Cost tracking
    cost_usd: {
      type: "decimal(10,6)",
      comment: "Cost incurred for this query (for paid sources)",
    },
  })

  // Unique constraint on source + query hash for upsert operations
  pgm.addConstraint("source_query_cache", "sqc_source_query_unique", {
    unique: ["source_type", "query_hash"],
  })

  // Index for finding cached queries by actor
  pgm.createIndex("source_query_cache", "actor_id", {
    name: "idx_sqc_actor_id",
    where: "actor_id IS NOT NULL",
  })

  // Index for finding recent queries by source
  pgm.createIndex("source_query_cache", ["source_type", "queried_at"], {
    name: "idx_sqc_source_queried",
  })

  // Index for cache hits (frequently used in WHERE clause)
  pgm.createIndex("source_query_cache", ["source_type", "query_hash"], {
    name: "idx_sqc_cache_lookup",
  })

  // Index for finding failed queries for retry
  pgm.createIndex("source_query_cache", "response_status", {
    name: "idx_sqc_response_status",
    where: "response_status >= 400 OR response_status IS NULL",
  })

  // Index for cost analysis by source
  pgm.createIndex("source_query_cache", ["source_type", "cost_usd"], {
    name: "idx_sqc_source_cost",
    where: "cost_usd IS NOT NULL AND cost_usd > 0",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("source_query_cache", { cascade: true })
}
