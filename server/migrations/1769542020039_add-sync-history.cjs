/**
 * Add sync_history table to track TMDB sync operations
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("sync_history", {
    id: { type: "serial", primaryKey: true },
    sync_type: { type: "varchar(50)", notNull: true }, // 'tmdb-people', 'tmdb-movies', 'tmdb-shows', 'tmdb-all'
    started_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    completed_at: { type: "timestamptz" },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "'running'",
    }, // 'running', 'completed', 'failed'
    items_checked: { type: "integer", default: 0 },
    items_updated: { type: "integer", default: 0 },
    new_deaths_found: { type: "integer", default: 0 },
    error_message: { type: "text" },
    parameters: { type: "jsonb" },
    triggered_by: { type: "varchar(100)" }, // 'admin', 'cron', 'manual'
  })

  // Index for querying recent syncs
  pgm.createIndex("sync_history", "started_at", { method: "btree" })
  pgm.createIndex("sync_history", "sync_type", { method: "btree" })
  pgm.createIndex("sync_history", "status", { method: "btree" })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("sync_history")
}
