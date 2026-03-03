/**
 * Drop the deathday month/day expression index.
 *
 * This index was created for the "On This Day" feature which has been removed.
 * No queries use EXTRACT(MONTH/DAY FROM deathday) anymore.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.dropIndex("actors", [], {
    name: "idx_actors_deathday_month_day",
    ifExists: true,
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql(`
    CREATE INDEX idx_actors_deathday_month_day ON actors (
      (EXTRACT(MONTH FROM deathday)::int),
      (EXTRACT(DAY FROM deathday)::int)
    )
  `);
};
