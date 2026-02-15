/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Create the cause_manner_mappings table
  pgm.createTable("cause_manner_mappings", {
    normalized_cause: {
      type: "text",
      primaryKey: true,
    },
    manner: {
      type: "text",
      notNull: true,
      check: "manner IN ('natural', 'accident', 'suicide', 'homicide', 'undetermined')",
    },
    source: {
      type: "text",
      notNull: true,
      default: "'deterministic'",
    },
    created_at: {
      type: "timestamptz",
      default: pgm.func("now()"),
    },
  })

  pgm.createIndex("cause_manner_mappings", "manner")

  // Fix 5 bad death_manner rows from enrichment
  pgm.sql(`
    UPDATE actors SET death_manner = NULL
    WHERE (cause_of_death ILIKE '%leukemia%' AND death_manner = 'accident')
       OR (cause_of_death ILIKE '%heart attack%' AND death_manner = 'accident')
       OR (cause_of_death ILIKE '%myocardial infarction%' AND death_manner = 'accident')
       OR (cause_of_death = 'complications from diabetes' AND death_manner = 'suicide')
  `)
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("cause_manner_mappings")
}
