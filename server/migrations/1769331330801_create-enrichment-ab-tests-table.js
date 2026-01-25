/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('enrichment_ab_tests', {
    id: 'id',
    actor_id: {
      type: 'integer',
      notNull: true,
      references: '"actors"',
      onDelete: 'CASCADE',
    },
    actor_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    version: {
      type: 'varchar(20)',
      notNull: true,
      check: "version IN ('with_sources', 'without_sources')",
    },
    circumstances: {
      type: 'text',
      notNull: false,
    },
    rumored_circumstances: {
      type: 'text',
      notNull: false,
    },
    sources: {
      type: 'jsonb',
      notNull: false,
      comment: 'Array of source URLs from AI response',
    },
    resolved_sources: {
      type: 'jsonb',
      notNull: false,
      comment: 'Resolved source names and URLs',
    },
    cost_usd: {
      type: 'numeric(10, 6)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Index for querying by actor
  pgm.createIndex('enrichment_ab_tests', 'actor_id');

  // Index for querying by version
  pgm.createIndex('enrichment_ab_tests', 'version');

  // Unique constraint to prevent duplicate tests for same actor/version
  pgm.createConstraint('enrichment_ab_tests', 'enrichment_ab_tests_actor_version_unique', {
    unique: ['actor_id', 'version'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('enrichment_ab_tests');
};
