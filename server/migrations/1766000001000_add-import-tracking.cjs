/**
 * Add import tracking columns to sync_state table.
 *
 * These columns enable checkpoint/resume functionality for the TV show import script:
 * - current_phase: Which import phase is running (popular/standard/obscure)
 * - last_processed_id: TMDB ID of last successfully processed show
 * - phase_total: Total number of items to process in current phase
 * - phase_completed: Number of items completed in current phase
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add columns for import progress tracking
  pgm.addColumn("sync_state", {
    current_phase: { type: "text" },
    last_processed_id: { type: "integer" },
    phase_total: { type: "integer" },
    phase_completed: { type: "integer" },
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("sync_state", [
    "current_phase",
    "last_processed_id",
    "phase_total",
    "phase_completed",
  ]);
};
