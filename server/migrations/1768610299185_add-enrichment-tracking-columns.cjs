/**
 * Migration: Add enrichment tracking columns to actors and actor_death_circumstances
 *
 * Adds columns to track when and how death enrichment data was added:
 * - enriched_at: Timestamp of when the enrichment script ran
 * - enrichment_source: Which script/method added the data (e.g., "multi-source-enrichment", "claude-batch")
 * - enrichment_version: Version string to allow re-running for older versions when script improves
 *
 * This allows querying for actors that need re-enrichment with improved methods.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add enrichment tracking columns to actors table (for basic death info)
  pgm.addColumn("actors", {
    enriched_at: {
      type: "timestamp with time zone",
      comment: "Timestamp when enrichment script processed this actor",
    },
    enrichment_source: {
      type: "text",
      comment: 'Which script/method added the data (e.g., "multi-source-enrichment", "claude-batch")',
    },
    enrichment_version: {
      type: "text",
      comment: "Version string to track script version for potential re-enrichment",
    },
  })

  // Indexes for actors table
  pgm.createIndex("actors", "enrichment_version", {
    name: "idx_actors_enrichment_version",
    where: "enrichment_version IS NOT NULL",
  })

  pgm.createIndex("actors", "enriched_at", {
    name: "idx_actors_enriched_at",
    where: "enriched_at IS NOT NULL",
  })

  // Add enrichment tracking columns to actor_death_circumstances table (for detailed info)
  pgm.addColumn("actor_death_circumstances", {
    enriched_at: {
      type: "timestamp with time zone",
      comment: "Timestamp when enrichment script processed this actor",
    },
    enrichment_source: {
      type: "text",
      comment: 'Which script/method added the data (e.g., "multi-source-enrichment", "claude-batch")',
    },
    enrichment_version: {
      type: "text",
      comment: "Version string to track script version for potential re-enrichment",
    },
  })

  // Indexes for actor_death_circumstances table
  pgm.createIndex("actor_death_circumstances", "enrichment_source", {
    name: "idx_death_circumstances_enrichment_source",
    where: "enrichment_source IS NOT NULL",
  })

  pgm.createIndex("actor_death_circumstances", "enrichment_version", {
    name: "idx_death_circumstances_enrichment_version",
    where: "enrichment_version IS NOT NULL",
  })

  pgm.createIndex("actor_death_circumstances", "enriched_at", {
    name: "idx_death_circumstances_enriched_at",
    where: "enriched_at IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop actors table indexes and columns
  pgm.dropIndex("actors", "enrichment_version", {
    name: "idx_actors_enrichment_version",
  })
  pgm.dropIndex("actors", "enriched_at", {
    name: "idx_actors_enriched_at",
  })
  pgm.dropColumn("actors", ["enriched_at", "enrichment_source", "enrichment_version"])

  // Drop actor_death_circumstances table indexes and columns
  pgm.dropIndex("actor_death_circumstances", "enrichment_source", {
    name: "idx_death_circumstances_enrichment_source",
  })
  pgm.dropIndex("actor_death_circumstances", "enrichment_version", {
    name: "idx_death_circumstances_enrichment_version",
  })
  pgm.dropIndex("actor_death_circumstances", "enriched_at", {
    name: "idx_death_circumstances_enriched_at",
  })
  pgm.dropColumn("actor_death_circumstances", [
    "enriched_at",
    "enrichment_source",
    "enrichment_version",
  ])
}
