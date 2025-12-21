/**
 * Add index for month/day lookups on deceased_persons.
 *
 * The "On This Day" feature queries by EXTRACT(MONTH) and EXTRACT(DAY) from deathday.
 * Without an index, this requires a full table scan.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create expression index for month/day lookups
  pgm.sql(`
    CREATE INDEX idx_deceased_persons_death_month_day
    ON deceased_persons (
      (EXTRACT(MONTH FROM deathday)::int),
      (EXTRACT(DAY FROM deathday)::int)
    )
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("deceased_persons", [], {
    name: "idx_deceased_persons_death_month_day",
    ifExists: true,
  });
};
