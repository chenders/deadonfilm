/**
 * Migration: Create actuarial_life_tables table
 *
 * Stores life expectancy data by birth year cohort and gender.
 * Data sourced from US Social Security Administration Period Life Tables.
 * Used to calculate expected mortality for movies based on actor ages.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('actuarial_life_tables', {
    id: 'id',
    birth_year: { type: 'integer', notNull: true },
    age: { type: 'integer', notNull: true },
    gender: { type: 'text', notNull: true },
    death_probability: { type: 'decimal(10,8)' },
    life_expectancy: { type: 'decimal(6,2)' },
    survivors_per_100k: { type: 'integer' },
  });

  // Unique constraint on birth_year, age, gender combination
  pgm.addConstraint('actuarial_life_tables', 'actuarial_life_tables_unique', {
    unique: ['birth_year', 'age', 'gender'],
  });

  // Index for efficient lookups
  pgm.createIndex('actuarial_life_tables', ['birth_year', 'age']);
  pgm.createIndex('actuarial_life_tables', ['gender']);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('actuarial_life_tables');
};
