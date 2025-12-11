/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Add synthesis_method, synthesis_confidence, and needs_review columns
 * NOTE: This is a stub migration - the changes were already applied to the database
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (_pgm) => {
  // Already applied - no-op
};

/**
 * @param _pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (_pgm) => {
  // No-op
};
