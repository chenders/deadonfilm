/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * Add profile_path column to deceased_persons table.
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
