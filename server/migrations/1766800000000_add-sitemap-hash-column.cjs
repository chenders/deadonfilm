/**
 * Migration: Add last_hash column to sync_state table
 *
 * Used by the sitemap generation CronJob to detect when sitemap content has changed.
 * The hash is compared against the previous value to avoid unnecessary submissions
 * to search engines.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumn("sync_state", {
    last_hash: { type: "text" },
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumn("sync_state", "last_hash")
}
