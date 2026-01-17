'use strict'

/**
 * Migration: Create enrichment_runs table for tracking script run statistics.
 *
 * Tracks batch-level statistics for death enrichment runs to measure
 * performance over time and identify areas for improvement.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Main enrichment runs table
  pgm.createTable('enrichment_runs', {
    id: { type: 'serial', primaryKey: true },

    // Timing
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    completed_at: { type: 'timestamptz' },
    duration_ms: { type: 'integer' },

    // Actor stats
    actors_queried: { type: 'integer', notNull: true, default: 0 },
    actors_processed: { type: 'integer', notNull: true, default: 0 },
    actors_enriched: { type: 'integer', notNull: true, default: 0 },
    actors_with_death_page: { type: 'integer', notNull: true, default: 0 },
    fill_rate: { type: 'decimal(5,2)' }, // percentage

    // Cost tracking
    total_cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },
    cost_by_source: { type: 'jsonb', notNull: true, default: '{}' },

    // Source stats
    source_hit_rates: { type: 'jsonb', notNull: true, default: '{}' },
    sources_attempted: { type: 'jsonb', notNull: true, default: '[]' },

    // Configuration used
    config: { type: 'jsonb', notNull: true, default: '{}' },

    // Link following stats (new feature)
    links_followed: { type: 'integer', notNull: true, default: 0 },
    pages_fetched: { type: 'integer', notNull: true, default: 0 },
    ai_link_selections: { type: 'integer', notNull: true, default: 0 },
    ai_content_extractions: { type: 'integer', notNull: true, default: 0 },

    // Error tracking
    error_count: { type: 'integer', notNull: true, default: 0 },
    errors: { type: 'jsonb', notNull: true, default: '[]' },

    // Exit reason
    exit_reason: { type: 'text' }, // 'completed', 'cost_limit', 'error', 'interrupted'

    // Script metadata
    script_name: { type: 'text' },
    script_version: { type: 'text' },
    hostname: { type: 'text' },
  })

  // Indexes for analysis queries
  pgm.createIndex('enrichment_runs', 'started_at')
  pgm.createIndex('enrichment_runs', 'fill_rate')
  pgm.createIndex('enrichment_runs', 'total_cost_usd')

  // Per-actor stats within a run (for detailed analysis)
  pgm.createTable('enrichment_run_actors', {
    id: { type: 'serial', primaryKey: true },
    run_id: {
      type: 'integer',
      notNull: true,
      references: 'enrichment_runs',
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
    created_death_page: { type: 'boolean', notNull: true, default: false },
    confidence: { type: 'decimal(3,2)' },

    // Sources
    sources_attempted: { type: 'jsonb', notNull: true, default: '[]' },
    winning_source: { type: 'text' },

    // Timing and cost
    processing_time_ms: { type: 'integer' },
    cost_usd: { type: 'decimal(10,6)', notNull: true, default: 0 },

    // Link following
    links_followed: { type: 'integer', notNull: true, default: 0 },
    pages_fetched: { type: 'integer', notNull: true, default: 0 },

    // Error
    error: { type: 'text' },
  })

  pgm.createIndex('enrichment_run_actors', 'run_id')
  pgm.createIndex('enrichment_run_actors', 'actor_id')
  pgm.createIndex('enrichment_run_actors', ['run_id', 'was_enriched'])

  // Add unique constraint to prevent duplicate entries
  pgm.addConstraint('enrichment_run_actors', 'enrichment_run_actors_run_actor_unique', {
    unique: ['run_id', 'actor_id'],
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('enrichment_run_actors')
  pgm.dropTable('enrichment_runs')
}
