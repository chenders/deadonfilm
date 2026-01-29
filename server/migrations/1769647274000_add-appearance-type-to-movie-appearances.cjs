/**
 * Migration: Add appearance_type column to actor_movie_appearances
 *
 * Adds a column to distinguish between different types of appearances:
 * - 'regular': Standard acting role (default)
 * - 'self': Playing themselves (documentaries, interviews, talk shows)
 * - 'archive': Archive footage from previous recordings
 *
 * This enables:
 * - Proper handling of documentaries where subjects play "themselves"
 * - Exclusion of archive footage actors from mortality calculations
 * - Import of documentary cast from IMDB datasets
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add appearance_type column to actor_movie_appearances
  pgm.addColumn("actor_movie_appearances", {
    appearance_type: {
      type: "text",
      notNull: true,
      default: "regular",
      comment: "Type of appearance: regular, self, archive",
    },
  })

  // Add check constraint to ensure valid appearance_type values
  pgm.addConstraint("actor_movie_appearances", "actor_movie_appearances_appearance_type_check", {
    check: "appearance_type IN ('regular', 'self', 'archive')",
  })

  // Create index for filtering by appearance type
  pgm.createIndex("actor_movie_appearances", "appearance_type", {
    name: "idx_actor_movie_appearances_type",
    where: "appearance_type != 'regular'", // Partial index for non-regular appearances
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("actor_movie_appearances", "appearance_type", {
    name: "idx_actor_movie_appearances_type",
  })
  pgm.dropConstraint("actor_movie_appearances", "actor_movie_appearances_appearance_type_check")
  pgm.dropColumn("actor_movie_appearances", "appearance_type")
}
