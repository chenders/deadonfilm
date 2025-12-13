/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add birthday, profile_path, and popularity columns to actor_appearances
  // These enable the Death Watch feature (actors most likely to die soon)
  pgm.addColumns("actor_appearances", {
    birthday: {
      type: "date",
      notNull: false,
    },
    profile_path: {
      type: "text",
      notNull: false,
    },
    popularity: {
      type: "decimal(10,3)",
      notNull: false,
    },
  })

  // Add index for efficient queries on living actors with birthdays
  pgm.createIndex("actor_appearances", ["is_deceased", "birthday"], {
    where: "is_deceased = false AND birthday IS NOT NULL",
    name: "idx_actor_appearances_living_with_birthday",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("actor_appearances", [], {
    name: "idx_actor_appearances_living_with_birthday",
  })
  pgm.dropColumns("actor_appearances", ["birthday", "profile_path", "popularity"])
}
