/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable("actor_snapshots", {
    id: "id",
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors(id)",
      onDelete: "CASCADE",
    },
    snapshot_data: {
      type: "jsonb",
      notNull: true,
    },
    circumstances_data: {
      type: "jsonb",
    },
    trigger_source: {
      type: "text",
      notNull: true,
    },
    trigger_details: {
      type: "jsonb",
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  pgm.createIndex("actor_snapshots", "actor_id", {
    name: "idx_actor_snapshots_actor_id",
  })

  pgm.createIndex("actor_snapshots", ["actor_id", { name: "created_at", sort: "DESC" }], {
    name: "idx_actor_snapshots_created_at",
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable("actor_snapshots")
}
