/**
 * Migration: Add cause_of_death_details column
 *
 * Stores the detailed explanation from Claude alongside the cause of death.
 * This allows showing additional context on hover in the UI.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn('deceased_persons', {
    cause_of_death_details: { type: 'text' }
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn('deceased_persons', 'cause_of_death_details');
};
