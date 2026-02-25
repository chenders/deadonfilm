/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("run_logs", {
    id: { type: "serial", primaryKey: true },
    run_type: { type: "text", notNull: true },
    run_id: { type: "integer", notNull: true },
    timestamp: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    level: { type: "text", notNull: true },
    message: { type: "text", notNull: true },
    data: { type: "jsonb" },
    source: { type: "text" },
  })

  pgm.createIndex("run_logs", ["run_type", "run_id", "timestamp"], {
    name: "idx_run_logs_lookup",
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("run_logs")
}
