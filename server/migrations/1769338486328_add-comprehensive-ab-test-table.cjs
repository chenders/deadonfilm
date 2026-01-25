/**
 * Add comprehensive A/B test tracking tables
 *
 * This migration creates tables to track:
 * - Test runs with real-time progress
 * - Individual variant results (provider × source strategy combinations)
 * - Real-time inferences and analysis
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Test runs table - tracks overall test execution
  pgm.createTable("ab_test_runs", {
    id: { type: "serial", primaryKey: true },
    test_name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "running",
    },
    total_actors: { type: "integer", notNull: true },
    completed_actors: { type: "integer", notNull: true, default: 0 },
    total_variants: { type: "integer", notNull: true },
    completed_variants: { type: "integer", notNull: true, default: 0 },
    providers: { type: "text[]", notNull: true },
    strategies: { type: "text[]", notNull: true },
    total_cost_usd: { type: "decimal(10,6)", notNull: true, default: 0 },
    inferences: {
      type: "jsonb",
      notNull: true,
      default: "[]",
    },
    actor_criteria: {
      type: "jsonb",
      notNull: true,
    },
    started_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
    completed_at: { type: "timestamp" },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  })

  // Comprehensive results table - stores all variant results
  pgm.createTable("ab_test_comprehensive_results", {
    id: { type: "serial", primaryKey: true },
    run_id: {
      type: "integer",
      notNull: true,
      references: "ab_test_runs",
      onDelete: "CASCADE"
    },
    actor_id: { type: "integer", notNull: true },
    actor_name: { type: "text", notNull: true },
    provider: { type: "text", notNull: true },
    strategy: {
      type: "text",
      notNull: true,
    },

    // The 3 key fields we're testing
    what_we_know: { type: "text" },
    alternative_accounts: { type: "text" },
    additional_context: { type: "text" },

    // Metadata
    sources: { type: "jsonb" },
    resolved_sources: { type: "jsonb" },
    raw_response: { type: "jsonb" },
    cost_usd: { type: "decimal(10,6)", notNull: true },
    response_time_ms: { type: "integer" },
    max_tokens_used: { type: "integer" },

    created_at: { type: "timestamp", notNull: true, default: pgm.func("NOW()") },
  })

  // Indexes for efficient queries
  pgm.createIndex("ab_test_runs", "status")
  pgm.createIndex("ab_test_runs", "created_at")
  pgm.createIndex("ab_test_comprehensive_results", "run_id")
  pgm.createIndex("ab_test_comprehensive_results", ["run_id", "actor_id"])
  pgm.createIndex("ab_test_comprehensive_results", ["provider", "strategy"])
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("ab_test_comprehensive_results")
  pgm.dropTable("ab_test_runs")
}
