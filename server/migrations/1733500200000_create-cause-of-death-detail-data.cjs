/**
 * Migration: Create cause_of_death_detail_data table
 *
 * This table stores detailed cause of death explanations from different sources
 * (claude, wikidata, wikipedia) for deceased actors.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create the trigger function for updating updated_at
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_cause_of_death_detail_data_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.createTable('cause_of_death_detail_data', {
    deceased_person_id: {
      type: 'integer',
      notNull: true,
      references: 'deceased_persons(tmdb_id)',
      onDelete: 'CASCADE',
    },
    source: {
      type: 'text',
      notNull: true,
    },
    cause_of_death_details: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('cause_of_death_detail_data', 'cause_of_death_detail_data_pkey', {
    primaryKey: ['deceased_person_id', 'source'],
  });

  pgm.sql(`
    CREATE TRIGGER cause_of_death_detail_data_updated_at_trigger
    BEFORE UPDATE ON cause_of_death_detail_data
    FOR EACH ROW
    EXECUTE FUNCTION update_cause_of_death_detail_data_updated_at();
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('cause_of_death_detail_data');
  pgm.sql('DROP FUNCTION IF EXISTS update_cause_of_death_detail_data_updated_at();');
};
