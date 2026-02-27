/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE actors ADD COLUMN wikidata_gender text;
    ALTER TABLE actors ADD COLUMN wikidata_ethnicity text;
    ALTER TABLE actors ADD COLUMN wikidata_birthplace_country text;
    ALTER TABLE actors ADD COLUMN wikidata_citizenship text;
    ALTER TABLE actors ADD COLUMN wikidata_military_service text;
    ALTER TABLE actors ADD COLUMN wikidata_occupations text;
    ALTER TABLE actors ADD COLUMN interestingness_score decimal(5,2);
    ALTER TABLE actors ADD COLUMN demographics_fetched_at timestamptz;
  `)

  pgm.sql(`
    CREATE INDEX idx_actors_interestingness ON actors (interestingness_score DESC NULLS LAST)
      WHERE deathday IS NOT NULL;
  `)
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_actors_interestingness;`)

  pgm.sql(`
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_gender;
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_ethnicity;
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_birthplace_country;
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_citizenship;
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_military_service;
    ALTER TABLE actors DROP COLUMN IF EXISTS wikidata_occupations;
    ALTER TABLE actors DROP COLUMN IF EXISTS interestingness_score;
    ALTER TABLE actors DROP COLUMN IF EXISTS demographics_fetched_at;
  `)
}
