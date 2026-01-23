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
  // Create page_visits table for tracking internal navigation
  pgm.createTable('page_visits', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    visited_path: {
      type: 'text',
      notNull: true,
      comment: 'The path that was visited, e.g., /movie/godfather-1972-238',
    },
    referrer_path: {
      type: 'text',
      notNull: false,
      comment: 'The referring path (NULL for external/direct)',
    },
    is_internal_referral: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether this was an internal navigation (referrer was from same site)',
    },
    session_id: {
      type: 'text',
      notNull: false,
      comment: 'Client-generated UUID for grouping visits by session',
    },
    user_agent: {
      type: 'text',
      notNull: false,
      comment: 'User agent string for analytics (bot detection, mobile vs desktop)',
    },
    visited_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
      comment: 'When the page was visited',
    },
  });

  // Add indexes for efficient querying
  pgm.createIndex('page_visits', 'visited_at', {
    name: 'idx_page_visits_visited_at',
    method: 'btree',
  });

  pgm.createIndex('page_visits', ['is_internal_referral', 'visited_at'], {
    name: 'idx_page_visits_internal_referral',
    method: 'btree',
  });

  pgm.createIndex('page_visits', 'visited_path', {
    name: 'idx_page_visits_visited_path',
    method: 'btree',
  });

  pgm.createIndex('page_visits', 'referrer_path', {
    name: 'idx_page_visits_referrer_path',
    method: 'btree',
    where: 'referrer_path IS NOT NULL',
  });

  pgm.createIndex('page_visits', ['session_id', 'visited_at'], {
    name: 'idx_page_visits_session',
    method: 'btree',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('page_visits');
};
