/**
 * Add batch_jobs table to track Claude Batch API jobs
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("batch_jobs", {
    id: { type: "serial", primaryKey: true },
    batch_id: { type: "varchar(100)", notNull: true, unique: true }, // Claude Batch API ID
    job_type: { type: "varchar(50)", notNull: true }, // 'cause-of-death', 'death-details'
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "'pending'",
    }, // 'pending', 'processing', 'completed', 'failed', 'cancelled'
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    completed_at: { type: "timestamptz" },
    total_items: { type: "integer", notNull: true },
    processed_items: { type: "integer", default: 0 },
    successful_items: { type: "integer", default: 0 },
    failed_items: { type: "integer", default: 0 },
    parameters: { type: "jsonb" }, // Stores query parameters used
    error_message: { type: "text" },
    results_url: { type: "text" }, // URL to download results from Claude API
    cost_usd: { type: "numeric(10,4)" }, // Track batch cost
  })

  // Index for querying recent jobs
  pgm.createIndex("batch_jobs", "created_at", { method: "btree" })
  pgm.createIndex("batch_jobs", "status", { method: "btree" })
  pgm.createIndex("batch_jobs", "job_type", { method: "btree" })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("batch_jobs")
}
