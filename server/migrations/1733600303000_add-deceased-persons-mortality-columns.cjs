/**
 * Migration: Add mortality columns to deceased_persons
 *
 * Adds columns for young deaths analysis:
 * - age_at_death: Calculated age when the actor died
 * - expected_lifespan: Life expectancy based on birth year and gender
 * - years_lost: Difference between expected and actual lifespan
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add columns if they don't exist
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE deceased_persons ADD COLUMN age_at_death INTEGER;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE deceased_persons ADD COLUMN expected_lifespan DECIMAL(5,2);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE deceased_persons ADD COLUMN years_lost DECIMAL(5,2);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  // Index for sorting by years lost (Young Deaths feature)
  pgm.createIndex('deceased_persons', 'years_lost', { ifNotExists: true });
  pgm.createIndex('deceased_persons', 'age_at_death', { ifNotExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('deceased_persons', 'years_lost');
  pgm.dropIndex('deceased_persons', 'age_at_death');
  pgm.dropColumn('deceased_persons', ['age_at_death', 'expected_lifespan', 'years_lost']);
};
