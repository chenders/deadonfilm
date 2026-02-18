'use strict'

/**
 * Migration: Create bio_enrichment_runs and bio_enrichment_run_actors tables
 * for tracking biography enrichment run statistics.
 *
 * Mirrors the death enrichment tracking pattern (enrichment_runs / enrichment_run_actors)
 * but with biography-specific columns (narrative confidence, synthesis cost, etc).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Main bio enrichment runs table
  pgm.createTable('bio_enrichment_runs', {
    id: { type: 'serial', primaryKey: true },

    // Timing
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    completed_at: { type: 'timestamptz' },
    duration_ms: { type: 'integer' },

    // Status
    status: {
      type: 'text',
      notNull: true,
      default: "'pending'",
      check: "status IN ('pending', 'running', 'completed', 'failed', 'stopped')",
    },

    // Actor stats
    actors_queried: { type: 'integer', notNull: true, default: 0 },
    actors_processed: { type: 'integer', notNull: true, default: 0 },
    actors_enriched: { type: 'integer', notNull: true, default: 0 },
    actors_with_substantive_content: { type: 'integer', notNull: true, default: 0 },
    fill_rate: { type: 'decimal(5,2)' },

    // Cost tracking
    total_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    synthesis_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    source_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    cost_by_source: { type: 'jsonb', notNull: true, default: '{}' },

    // Source stats
    source_hit_rates: { type: 'jsonb', notNull: true, default: '{}' },
    sources_attempted: { type: 'jsonb', notNull: true, default: '[]' },

    // Configuration used
    config: { type: 'jsonb', notNull: true, default: '{}' },

    // Error tracking
    error_count: { type: 'integer', notNull: true, default: 0 },
    errors: { type: 'jsonb', notNull: true, default: '[]' },

    // Exit reason
    exit_reason: { type: 'text' },

    // Progress tracking
    current_actor_index: { type: 'integer' },
    current_actor_name: { type: 'text' },

    // Script metadata
    script_name: { type: 'text' },
    hostname: { type: 'text' },
  })

  pgm.createIndex('bio_enrichment_runs', 'started_at')
  pgm.createIndex('bio_enrichment_runs', 'status')

  // Per-actor stats within a run
  pgm.createTable('bio_enrichment_run_actors', {
    id: { type: 'serial', primaryKey: true },
    run_id: {
      type: 'integer',
      notNull: true,
      references: 'bio_enrichment_runs',
      onDelete: 'CASCADE',
    },
    actor_id: {
      type: 'integer',
      notNull: true,
      references: 'actors',
      onDelete: 'CASCADE',
    },

    // Results
    was_enriched: { type: 'boolean', notNull: true, default: false },
    has_substantive_content: { type: 'boolean', notNull: true, default: false },
    narrative_confidence: { type: 'text' },

    // Sources
    sources_attempted: { type: 'jsonb', notNull: true, default: '[]' },
    sources_succeeded: { type: 'integer', notNull: true, default: 0 },
    synthesis_model: { type: 'text' },

    // Timing and cost
    processing_time_ms: { type: 'integer' },
    cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    source_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    synthesis_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },

    // Error
    error: { type: 'text' },

    // Logs (all log entries, not just errors)
    log_entries: { type: 'jsonb', default: pgm.func("'[]'::jsonb") },
  })

  pgm.createIndex('bio_enrichment_run_actors', 'run_id')
  pgm.createIndex('bio_enrichment_run_actors', 'actor_id')

  pgm.addConstraint('bio_enrichment_run_actors', 'bio_enrichment_run_actors_run_actor_unique', {
    unique: ['run_id', 'actor_id'],
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('bio_enrichment_run_actors')
  pgm.dropTable('bio_enrichment_runs')
}
