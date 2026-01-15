/**
 * Migration: Add related_deaths column to actor_death_circumstances
 *
 * For cases where family members or others died in connection with
 * the actor's death (same incident, discovered together, etc.)
 *
 * Example: Gene Hackman's wife Betsy Arakawa died from hantavirus
 * approximately one week before him.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn("actor_death_circumstances", {
    related_deaths: { type: "text" },
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("actor_death_circumstances", "related_deaths")
}
