/**
 * Migration: Add enrichment review workflow (Stage 4)
 *
 * Implements staging workflow where enrichment results are reviewed before committing to production:
 * 1. Enrichment runs write to staging tables
 * 2. Admin reviews and filters by confidence scores
 * 3. Admin can manually override/edit results
 * 4. Approved enrichments committed to actors/actor_death_circumstances tables
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
  // STEP 1: Add review_status to enrichment_runs
  // ============================================================
  pgm.addColumn('enrichment_runs', {
    review_status: {
      type: 'text',
      notNull: true,
      default: 'not_applicable', // For runs completed before review workflow
      check: "review_status IN ('not_applicable', 'pending_review', 'in_review', 'approved', 'rejected', 'committed')"
    },
    reviewed_by: { type: 'text' }, // Admin username/email who reviewed
    reviewed_at: { type: 'timestamptz' },
    review_notes: { type: 'text' }, // Admin notes about the review
  });

  pgm.createIndex('enrichment_runs', 'review_status');

  // ============================================================
  // STEP 2: Create actor_enrichment_staging table
  // Stores basic death data before committing to actors table
  // ============================================================
  pgm.createTable('actor_enrichment_staging', {
    id: 'id',

    // Link to enrichment_run_actors for traceability
    enrichment_run_actor_id: {
      type: 'integer',
      notNull: true,
      unique: true, // One staging record per run actor
      references: 'enrichment_run_actors',
      onDelete: 'CASCADE',
    },

    // Actor reference
    actor_id: {
      type: 'integer',
      notNull: true,
      references: 'actors',
      onDelete: 'CASCADE',
    },

    // Death data (mirrors key fields from actors table)
    deathday: { type: 'date' },
    cause_of_death: { type: 'text' },
    cause_of_death_source: { type: 'text' },
    cause_of_death_details: { type: 'text' },
    cause_of_death_details_source: { type: 'text' },
    wikipedia_url: { type: 'text' },
    age_at_death: { type: 'integer' },
    expected_lifespan: { type: 'decimal(5,2)' },
    years_lost: { type: 'decimal(5,2)' },
    violent_death: { type: 'boolean' },
    has_detailed_death_info: { type: 'boolean' },

    // Review metadata
    review_status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "review_status IN ('pending', 'approved', 'rejected', 'edited')"
    },

    // Timestamps
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createIndex('actor_enrichment_staging', 'actor_id');
  pgm.createIndex('actor_enrichment_staging', 'enrichment_run_actor_id');
  pgm.createIndex('actor_enrichment_staging', 'review_status');

  // ============================================================
  // STEP 3: Create actor_death_circumstances_staging table
  // Stores detailed death circumstances before committing
  // ============================================================
  pgm.createTable('actor_death_circumstances_staging', {
    id: 'id',

    // Link to staging record
    actor_enrichment_staging_id: {
      type: 'integer',
      notNull: true,
      unique: true, // One circumstances record per staging record
      references: 'actor_enrichment_staging',
      onDelete: 'CASCADE',
    },

    // Actor reference
    actor_id: {
      type: 'integer',
      notNull: true,
      references: 'actors',
      onDelete: 'CASCADE',
    },

    // Official account
    circumstances: { type: 'text' },
    circumstances_confidence: {
      type: 'text',
      check: "circumstances_confidence IN ('high', 'medium', 'low', 'disputed')",
    },

    // Alternative/disputed info
    rumored_circumstances: { type: 'text' },

    // Per-field confidence scores
    cause_confidence: {
      type: 'text',
      check: "cause_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    details_confidence: {
      type: 'text',
      check: "details_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    birthday_confidence: {
      type: 'text',
      check: "birthday_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    deathday_confidence: {
      type: 'text',
      check: "deathday_confidence IN ('high', 'medium', 'low', 'disputed')",
    },

    // Career context
    location_of_death: { type: 'text' },
    last_project: { type: 'jsonb' },
    career_status_at_death: {
      type: 'text',
      check: "career_status_at_death IN ('active', 'semi-retired', 'retired', 'hiatus', 'unknown')",
    },
    posthumous_releases: { type: 'jsonb' },

    // Related celebrities
    related_celebrity_ids: { type: 'integer[]' },
    related_celebrities: { type: 'jsonb' },

    // Additional context
    additional_context: { type: 'text' },

    // Searchable tags
    notable_factors: { type: 'text[]' },

    // Sources and raw data
    sources: { type: 'jsonb' },
    raw_response: { type: 'jsonb' },

    // Timestamps
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createIndex('actor_death_circumstances_staging', 'actor_id');
  pgm.createIndex('actor_death_circumstances_staging', 'actor_enrichment_staging_id');
  pgm.createIndex('actor_death_circumstances_staging', 'cause_confidence', {
    where: 'cause_confidence IS NOT NULL',
  });

  pgm.sql(`
    CREATE INDEX idx_death_circumstances_staging_notable ON actor_death_circumstances_staging
    USING GIN(notable_factors) WHERE notable_factors IS NOT NULL
  `);

  // ============================================================
  // STEP 4: Create enrichment_review_decisions table
  // Tracks admin decisions with audit trail
  // ============================================================
  pgm.createTable('enrichment_review_decisions', {
    id: 'id',

    // Link to enrichment run actor
    enrichment_run_actor_id: {
      type: 'integer',
      notNull: true,
      references: 'enrichment_run_actors',
      onDelete: 'CASCADE',
    },

    // Decision
    decision: {
      type: 'text',
      notNull: true,
      check: "decision IN ('approved', 'rejected', 'manually_edited')"
    },

    // Original vs edited values (for manual edits)
    original_values: { type: 'jsonb' }, // Snapshot of staging data before edit
    edited_values: { type: 'jsonb' },   // Changed fields

    // Admin who made decision
    admin_user: { type: 'text', notNull: true },
    admin_notes: { type: 'text' },

    // Rejection reason (if rejected)
    rejection_reason: {
      type: 'text',
      check: "rejection_reason IN ('low_confidence', 'incorrect_data', 'duplicate', 'no_death_info', 'other')"
    },
    rejection_details: { type: 'text' },

    // Timestamps
    decided_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    committed_at: { type: 'timestamptz' }, // When approved data was committed to production
  });

  pgm.createIndex('enrichment_review_decisions', 'enrichment_run_actor_id');
  pgm.createIndex('enrichment_review_decisions', 'decision');
  pgm.createIndex('enrichment_review_decisions', 'admin_user');
  pgm.createIndex('enrichment_review_decisions', 'decided_at');

  // ============================================================
  // STEP 5: Add helper views for review UI
  // ============================================================

  // View: Pending enrichments with confidence scores
  pgm.sql(`
    CREATE VIEW enrichment_pending_review AS
    SELECT
      era.id as enrichment_run_actor_id,
      era.run_id,
      er.started_at as run_started_at,
      era.actor_id,
      a.name as actor_name,
      a.tmdb_id as actor_tmdb_id,
      aes.deathday,
      aes.cause_of_death,
      aes.cause_of_death_details,
      aes.review_status,
      adcs.circumstances_confidence,
      adcs.cause_confidence,
      adcs.details_confidence,
      adcs.deathday_confidence,
      era.confidence as overall_confidence,
      era.winning_source,
      era.cost_usd
    FROM enrichment_run_actors era
    JOIN enrichment_runs er ON er.id = era.run_id
    JOIN actors a ON a.id = era.actor_id
    LEFT JOIN actor_enrichment_staging aes ON aes.enrichment_run_actor_id = era.id
    LEFT JOIN actor_death_circumstances_staging adcs ON adcs.actor_enrichment_staging_id = aes.id
    WHERE er.review_status IN ('pending_review', 'in_review')
      AND aes.review_status = 'pending'
      AND era.was_enriched = true
    ORDER BY er.started_at DESC, era.id ASC
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop view
  pgm.dropView('enrichment_pending_review');

  // Drop tables in reverse order
  pgm.dropTable('enrichment_review_decisions');
  pgm.dropTable('actor_death_circumstances_staging');
  pgm.dropTable('actor_enrichment_staging');

  // Remove columns from enrichment_runs
  pgm.dropColumn('enrichment_runs', ['review_status', 'reviewed_by', 'reviewed_at', 'review_notes']);
};
