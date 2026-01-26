/**
 * Update unique constraint to include test_type.
 *
 * The original constraint on (actor_id, version) doesn't fully namespace
 * variants across test types, allowing conflicts. This migration updates
 * the constraint to (test_type, actor_id, version).
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
  // Drop the old unique constraint
  pgm.dropConstraint("enrichment_ab_tests", "enrichment_ab_tests_actor_version_unique")

  // Create new unique constraint including test_type
  pgm.createConstraint("enrichment_ab_tests", "enrichment_ab_tests_type_actor_version_unique", {
    unique: ["test_type", "actor_id", "version"],
  })
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop the new constraint
  pgm.dropConstraint("enrichment_ab_tests", "enrichment_ab_tests_type_actor_version_unique")

  // Restore the old constraint
  pgm.createConstraint("enrichment_ab_tests", "enrichment_ab_tests_actor_version_unique", {
    unique: ["actor_id", "version"],
  })
};
