/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Add backdrop_path column to movies table
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
