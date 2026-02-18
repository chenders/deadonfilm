/**
 * Migration: Add actor_biography_details table and biography version columns
 *
 * Stores detailed biography information separate from the actors table:
 * - Human-focused narrative biography with teaser
 * - Life context sections (birthplace, family, education, pre-fame, fame catalyst)
 * - Personal details (struggles, relationships, lesser-known facts)
 * - Structured life notable factors for filtering
 * - Per-field source tracking and entity links
 *
 * Also adds biography versioning columns to the actors table:
 * - biography_legacy: archive of old AI-generated biography
 * - biography_version: tracks which generation iteration produced current biography
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add versioning columns to existing actors table
  pgm.addColumn("actors", {
    biography_legacy: { type: "text" },
    biography_version: { type: "integer" },
  })

  // Create the biography details table
  pgm.createTable("actor_biography_details", {
    id: "id",

    // Reference to actors table
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors(id)",
      onDelete: "CASCADE",
    },

    // Narrative biography
    narrative_teaser: { type: "text" }, // 2-3 sentence hook shown before "show more"
    narrative: { type: "text" }, // Full human-focused biography
    narrative_confidence: {
      type: "text",
      check: "narrative_confidence IN ('high', 'medium', 'low')",
    },

    // Structured life tags
    life_notable_factors: { type: "text[]" },

    // Life context sections
    birthplace_details: { type: "text" },
    family_background: { type: "text" },
    education: { type: "text" },
    pre_fame_life: { type: "text" },
    fame_catalyst: { type: "text" },

    // Personal details
    personal_struggles: { type: "text" },
    relationships: { type: "text" },
    lesser_known_facts: { type: "text[]" }, // Array of surprising facts

    // Sources and linking
    sources: { type: "jsonb" }, // Per-field source tracking
    entity_links: { type: "jsonb" }, // Auto-detected entity links

    // Timestamps
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  // Unique constraint - one biography record per actor
  pgm.addConstraint("actor_biography_details", "abd_actor_unique", {
    unique: ["actor_id"],
  })

  // Index on actor_id for efficient lookups
  pgm.createIndex("actor_biography_details", "actor_id", {
    name: "idx_actor_biography_details_actor_id",
  })

  // GIN index on life_notable_factors for array containment queries
  pgm.sql(`
    CREATE INDEX idx_actor_biography_details_life_factors
    ON actor_biography_details USING GIN(life_notable_factors)
    WHERE life_notable_factors IS NOT NULL
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("actor_biography_details", { cascade: true })

  pgm.dropColumn("actors", ["biography_legacy", "biography_version"])
}
