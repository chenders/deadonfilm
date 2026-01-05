/**
 * Migration: Add death categorization columns to actors table
 *
 * Adds structured death categorization fields:
 * - death_manner: medical examiner classification (natural, accident, suicide, etc.)
 * - death_categories: array of contributing factors (cancer, heart_disease, etc.)
 * - covid_related: boolean flag for COVID-related deaths
 * - strange_death: boolean for unusual/notable deaths
 * - has_detailed_death_info: boolean to flag actors with detailed death pages
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add death_manner column with check constraint
  pgm.addColumn("actors", {
    death_manner: {
      type: "text",
      check: "death_manner IN ('natural', 'accident', 'suicide', 'homicide', 'undetermined', 'pending')",
    },
  })

  // Add death_categories as text array (supports multiple contributing factors)
  pgm.addColumn("actors", {
    death_categories: {
      type: "text[]",
    },
  })

  // Add covid_related boolean flag
  pgm.addColumn("actors", {
    covid_related: {
      type: "boolean",
    },
  })

  // Add strange_death boolean flag
  pgm.addColumn("actors", {
    strange_death: {
      type: "boolean",
    },
  })

  // Add has_detailed_death_info flag (triggers dedicated death page)
  pgm.addColumn("actors", {
    has_detailed_death_info: {
      type: "boolean",
    },
  })

  // Create indexes for efficient querying
  pgm.createIndex("actors", "death_manner", {
    name: "idx_actors_death_manner",
    where: "death_manner IS NOT NULL",
  })

  pgm.sql(`
    CREATE INDEX idx_actors_death_categories ON actors USING GIN(death_categories)
    WHERE death_categories IS NOT NULL
  `)

  pgm.createIndex("actors", "covid_related", {
    name: "idx_actors_covid_related",
    where: "covid_related = true",
  })

  pgm.createIndex("actors", "strange_death", {
    name: "idx_actors_strange_death",
    where: "strange_death = true",
  })

  pgm.createIndex("actors", "has_detailed_death_info", {
    name: "idx_actors_has_detailed_death",
    where: "has_detailed_death_info = true",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop indexes
  pgm.dropIndex("actors", [], { name: "idx_actors_has_detailed_death" })
  pgm.dropIndex("actors", [], { name: "idx_actors_strange_death" })
  pgm.dropIndex("actors", [], { name: "idx_actors_covid_related" })
  pgm.dropIndex("actors", [], { name: "idx_actors_death_categories" })
  pgm.dropIndex("actors", [], { name: "idx_actors_death_manner" })

  // Drop columns
  pgm.dropColumn("actors", "has_detailed_death_info")
  pgm.dropColumn("actors", "strange_death")
  pgm.dropColumn("actors", "covid_related")
  pgm.dropColumn("actors", "death_categories")
  pgm.dropColumn("actors", "death_manner")
}
