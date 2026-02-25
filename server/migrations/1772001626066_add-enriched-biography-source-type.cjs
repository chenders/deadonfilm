/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Replace the CHECK constraint to include 'enriched' as a valid biography_source_type
  pgm.sql(`
    ALTER TABLE actors DROP CONSTRAINT actors_biography_source_type_check;
    ALTER TABLE actors ADD CONSTRAINT actors_biography_source_type_check
      CHECK (biography_source_type = ANY (ARRAY['wikipedia', 'tmdb', 'imdb', 'enriched']));
  `)

  // Fix existing enriched actors that have wrong biography_source_type
  pgm.sql(`
    UPDATE actors SET biography_source_type = 'enriched'
    WHERE id IN (SELECT actor_id FROM actor_biography_details WHERE narrative IS NOT NULL)
    AND (biography_source_type IS NULL OR biography_source_type != 'enriched');
  `)
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Revert enriched actors back to NULL before restoring old constraint
  pgm.sql(`
    UPDATE actors SET biography_source_type = NULL
    WHERE biography_source_type = 'enriched';
  `)

  pgm.sql(`
    ALTER TABLE actors DROP CONSTRAINT actors_biography_source_type_check;
    ALTER TABLE actors ADD CONSTRAINT actors_biography_source_type_check
      CHECK (biography_source_type = ANY (ARRAY['wikipedia', 'tmdb', 'imdb']));
  `)
}
