/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable("cohort_life_expectancy", {
    id: "id",
    birth_year: {
      type: "integer",
      notNull: true,
    },
    male: {
      type: "decimal(4,1)",
      notNull: true,
    },
    female: {
      type: "decimal(4,1)",
      notNull: true,
    },
    combined: {
      type: "decimal(4,1)",
      notNull: true,
    },
  });

  // Add unique constraint on birth_year
  pgm.addConstraint("cohort_life_expectancy", "cohort_life_expectancy_birth_year_unique", {
    unique: ["birth_year"],
  });

  // Add index for birth year lookups
  pgm.createIndex("cohort_life_expectancy", "birth_year");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable("cohort_life_expectancy");
};
