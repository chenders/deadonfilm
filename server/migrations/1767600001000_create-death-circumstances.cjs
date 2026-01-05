/**
 * Migration: Create actor_death_circumstances table
 *
 * Stores detailed death circumstances separate from the actors table:
 * - Official and rumored circumstances with confidence levels
 * - Per-field confidence scores (cause, details, birthday, deathday)
 * - Career context (location, last project, posthumous releases)
 * - Related celebrities with TMDB IDs for linking
 * - Structured sources with archive.org URLs
 * - Raw Claude response for future re-analysis
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("actor_death_circumstances", {
    id: "id",

    // Reference to actors table
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors(id)",
      onDelete: "CASCADE",
    },

    // Official account
    circumstances: { type: "text" },
    circumstances_confidence: {
      type: "text",
      check: "circumstances_confidence IN ('high', 'medium', 'low', 'disputed')",
    },

    // Alternative/disputed info
    rumored_circumstances: { type: "text" },

    // Per-field confidence scores
    cause_confidence: {
      type: "text",
      check: "cause_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    details_confidence: {
      type: "text",
      check: "details_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    birthday_confidence: {
      type: "text",
      check: "birthday_confidence IN ('high', 'medium', 'low', 'disputed')",
    },
    deathday_confidence: {
      type: "text",
      check: "deathday_confidence IN ('high', 'medium', 'low', 'disputed')",
    },

    // Career context
    location_of_death: { type: "text" },
    last_project: { type: "jsonb" }, // {"title": "...", "year": 2022, "tmdb_id": 123, "imdb_id": "tt123", "type": "movie/show"}
    career_status_at_death: {
      type: "text",
      check: "career_status_at_death IN ('active', 'semi-retired', 'retired', 'hiatus', 'unknown')",
    },
    posthumous_releases: { type: "jsonb" }, // Array of project objects with tmdb_id/imdb_id for linking

    // Related celebrities (for linking on death details page)
    related_celebrity_ids: { type: "integer[]" }, // Array of actor IDs from our actors table
    related_celebrities: { type: "jsonb" }, // Full details: [{"name": "...", "tmdb_id": 123, "relationship": "..."}]

    // Additional context
    additional_context: { type: "text" }, // Extra background info that doesn't fit elsewhere

    // Searchable tags
    notable_factors: { type: "text[]" },

    // Sources and raw data
    sources: { type: "jsonb" }, // Per-field sources: {"cause": [...], "rumored": [...], ...}
    raw_response: { type: "jsonb" }, // Full Claude response for future re-analysis

    // Timestamps
    created_at: { type: "timestamp", default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", default: pgm.func("NOW()") },
  })

  // Unique constraint - one circumstances record per actor
  pgm.addConstraint("actor_death_circumstances", "adc_actor_unique", {
    unique: ["actor_id"],
  })

  // Indexes for efficient querying
  pgm.sql(`
    CREATE INDEX idx_death_circumstances_notable ON actor_death_circumstances
    USING GIN(notable_factors) WHERE notable_factors IS NOT NULL
  `)

  pgm.createIndex("actor_death_circumstances", "cause_confidence", {
    name: "idx_death_circumstances_cause_conf",
    where: "cause_confidence IS NOT NULL",
  })

  pgm.sql(`
    CREATE INDEX idx_death_circumstances_raw ON actor_death_circumstances
    USING GIN(raw_response) WHERE raw_response IS NOT NULL
  `)

  pgm.sql(`
    CREATE INDEX idx_death_circumstances_sources ON actor_death_circumstances
    USING GIN(sources) WHERE sources IS NOT NULL
  `)

  pgm.createIndex("actor_death_circumstances", "location_of_death", {
    name: "idx_death_circumstances_location",
    where: "location_of_death IS NOT NULL",
  })

  pgm.sql(`
    CREATE INDEX idx_death_circumstances_related ON actor_death_circumstances
    USING GIN(related_celebrity_ids) WHERE related_celebrity_ids IS NOT NULL
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("actor_death_circumstances", { cascade: true })
}
