/**
 * Migration: Add mortality columns to deceased_persons
 *
 * Adds columns for young deaths analysis:
 * - age_at_death: Calculated age when the actor died
 * - expected_lifespan: Life expectancy based on birth year and gender
 * - years_lost: Difference between expected and actual lifespan
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn('deceased_persons', {
    age_at_death: { type: 'integer' },
    expected_lifespan: { type: 'decimal(5,2)' },
    years_lost: { type: 'decimal(5,2)' },
  });

  // Index for sorting by years lost (Young Deaths feature)
  pgm.createIndex('deceased_persons', 'years_lost');
  pgm.createIndex('deceased_persons', 'age_at_death');
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('deceased_persons', 'years_lost');
  pgm.dropIndex('deceased_persons', 'age_at_death');
  pgm.dropColumn('deceased_persons', ['age_at_death', 'expected_lifespan', 'years_lost']);
};
