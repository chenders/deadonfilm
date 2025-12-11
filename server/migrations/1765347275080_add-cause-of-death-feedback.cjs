/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Add cause_of_death_feedback column for user corrections.
 * NOTE: This is a stub migration - the changes were already applied to the database.
 * @param {import('node-pg-migrate').MigrationBuilder} _pgm
 */
exports.up = (_pgm) => {
  // Already applied - no-op
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} _pgm
 */
exports.down = (_pgm) => {
  // No-op
};
