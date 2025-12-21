/**
 * Drop unused/redundant indexes to save storage and improve write performance.
 *
 * Based on pg_stat_user_indexes analysis:
 * - actor_appearances_is_deceased_index: 0 scans, covered by partial index idx_actor_appearances_living_with_birthday
 * - idx_deceased_persons_tmdb_id: redundant with deceased_persons_pkey (both on tmdb_id)
 * - movies_tmdb_id_index: redundant with movies_tmdb_id_key unique constraint
 *
 * Total savings: ~17 MB
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Drop is_deceased index - covered by partial index with birthday
  pgm.dropIndex("actor_appearances", "is_deceased", {
    name: "actor_appearances_is_deceased_index",
    ifExists: true,
  });

  // Drop redundant tmdb_id index - primary key already covers this
  pgm.dropIndex("deceased_persons", "tmdb_id", {
    name: "idx_deceased_persons_tmdb_id",
    ifExists: true,
  });

  // Drop redundant tmdb_id index - unique constraint already covers this
  pgm.dropIndex("movies", "tmdb_id", {
    name: "movies_tmdb_id_index",
    ifExists: true,
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Recreate the indexes if needed
  pgm.createIndex("actor_appearances", "is_deceased", {
    name: "actor_appearances_is_deceased_index",
  });

  pgm.createIndex("deceased_persons", "tmdb_id", {
    name: "idx_deceased_persons_tmdb_id",
  });

  pgm.createIndex("movies", "tmdb_id", {
    name: "movies_tmdb_id_index",
  });
};
