/**
 * @param {import('node-pg-migrate').MigrationBuilder} _pgm
 */
exports.up = (_pgm) => {
  // Already applied in production - this is a placeholder
  // Adds imdb_id_source column to movies and shows
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} _pgm
 */
exports.down = (_pgm) => {
  // Placeholder - no rollback needed
}
