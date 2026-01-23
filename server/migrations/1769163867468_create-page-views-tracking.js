/**
 * Migration: Create page views tracking
 *
 * Implements page view analytics for all content types:
 * - Movies, TV shows, episodes, actor death detail pages
 * - Tracks referrer and user agent for basic analytics
 * - Enables trending content analysis and view count features
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // ============================================================
  // STEP 1: Create page_type enum
  // ============================================================
  pgm.createType('page_type_enum', ['movie', 'show', 'episode', 'actor_death']);

  // ============================================================
  // STEP 2: Create page_views table
  // ============================================================
  pgm.createTable('page_views', {
    id: 'id', // bigserial primary key

    // Page identification
    page_type: {
      type: 'page_type_enum',
      notNull: true,
    },
    entity_id: {
      type: 'bigint',
      notNull: true,
      comment: 'References movie/show/episode/actor ID depending on page_type',
    },
    path: {
      type: 'text',
      notNull: true,
      comment: 'Full URL path for the viewed page',
    },

    // View metadata
    viewed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    referrer: {
      type: 'text',
      comment: 'HTTP referrer header (where user came from)',
    },
    user_agent: {
      type: 'text',
      comment: 'User agent string for basic device/browser analytics',
    },
  });

  // ============================================================
  // STEP 3: Create indexes for efficient querying
  // ============================================================

  // Entity-specific queries (e.g., "views for movie ID 123")
  pgm.createIndex('page_views', ['page_type', 'entity_id', 'viewed_at'], {
    name: 'idx_page_views_entity_time',
  });

  // Time-based queries (e.g., "all views in last 30 days")
  pgm.createIndex('page_views', ['viewed_at'], {
    name: 'idx_page_views_time',
    method: 'btree',
  });

  // Type-specific trends (e.g., "movie views over time")
  pgm.createIndex('page_views', ['page_type', 'viewed_at'], {
    name: 'idx_page_views_type_time',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('page_views');
  pgm.dropType('page_type_enum');
};
