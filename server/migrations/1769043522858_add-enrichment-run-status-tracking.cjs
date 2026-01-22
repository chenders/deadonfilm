'use strict'

/**
 * Migration: Add status tracking columns to enrichment_runs for real-time progress monitoring
 *
 * Adds columns to track running enrichments and their progress:
 * - status: Current state of the enrichment run
 * - process_id: PID of the running enrichment process
 * - current_actor_index: Progress tracking (which actor is currently being processed)
 * - current_actor_name: Name of the actor currently being processed
 *
 * This enables the admin UI to display real-time progress and stop running enrichments.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add status column with CHECK constraint
  pgm.addColumn('enrichment_runs', {
    status: {
      type: 'text',
      notNull: true,
      default: "'pending'",
      check: "status IN ('pending', 'running', 'completed', 'failed', 'stopped')",
      comment: 'Current status of the enrichment run',
    },
  })

  // Add process tracking columns
  pgm.addColumn('enrichment_runs', {
    process_id: {
      type: 'integer',
      comment: 'PID of the running enrichment process (NULL if not running)',
    },
    current_actor_index: {
      type: 'integer',
      comment: 'Index of the actor currently being processed (0-based)',
    },
    current_actor_name: {
      type: 'text',
      comment: 'Name of the actor currently being processed',
    },
  })

  // Create index on status for filtering running/completed enrichments
  pgm.createIndex('enrichment_runs', 'status')

  // Update existing rows to have 'completed' status if they have completed_at set
  pgm.sql(`
    UPDATE enrichment_runs
    SET status = CASE
      WHEN completed_at IS NOT NULL AND exit_reason = 'error' THEN 'failed'
      WHEN completed_at IS NOT NULL AND exit_reason = 'interrupted' THEN 'stopped'
      WHEN completed_at IS NOT NULL THEN 'completed'
      ELSE 'pending'
    END
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop index
  pgm.dropIndex('enrichment_runs', 'status')

  // Drop columns
  pgm.dropColumn('enrichment_runs', ['status', 'process_id', 'current_actor_index', 'current_actor_name'])
}
