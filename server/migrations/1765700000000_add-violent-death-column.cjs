/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add violent_death boolean column
  pgm.addColumn("deceased_persons", {
    violent_death: {
      type: "boolean",
      default: null,
    },
  })

  // Create partial index for efficient queries on violent deaths
  pgm.createIndex("deceased_persons", "violent_death", {
    name: "idx_deceased_persons_violent_death",
    where: "violent_death = true",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("deceased_persons", "violent_death", {
    name: "idx_deceased_persons_violent_death",
  })
  pgm.dropColumn("deceased_persons", "violent_death")
}
