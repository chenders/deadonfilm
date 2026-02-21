/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE rejected_notable_factors (
      id SERIAL PRIMARY KEY,
      factor_name TEXT NOT NULL,
      factor_type TEXT NOT NULL CHECK (factor_type IN ('life', 'death')),
      actor_id INTEGER REFERENCES actors(id),
      actor_name TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Supports admin queries that filter/group by (factor_name, factor_type)
    CREATE INDEX idx_rejected_factors_name_type ON rejected_notable_factors (factor_name, factor_type);
    -- Supports "recent actors" lookups and ordering by recency
    CREATE INDEX idx_rejected_factors_type_name_created ON rejected_notable_factors (factor_type, factor_name, created_at DESC);
    CREATE INDEX idx_rejected_factors_created ON rejected_notable_factors (created_at DESC);
  `)
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS rejected_notable_factors`)
}
