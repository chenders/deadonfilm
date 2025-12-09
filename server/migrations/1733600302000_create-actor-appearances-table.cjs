/**
 * Migration: Create actor_appearances table
 *
 * Links actors to movies for cross-movie analysis (Cursed Actors feature).
 * Tracks actor appearances across multiple movies to calculate co-star mortality.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('actor_appearances', {
    id: 'id',
    actor_tmdb_id: { type: 'integer', notNull: true },
    movie_tmdb_id: { type: 'integer', notNull: true },
    actor_name: { type: 'text', notNull: true },
    character_name: { type: 'text' },
    billing_order: { type: 'integer' },
    age_at_filming: { type: 'integer' },
    is_deceased: { type: 'boolean', default: false },
  }, { ifNotExists: true });

  // Unique constraint on actor_tmdb_id, movie_tmdb_id combination
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE actor_appearances ADD CONSTRAINT actor_appearances_unique UNIQUE (actor_tmdb_id, movie_tmdb_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Foreign key to movies table
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE actor_appearances ADD CONSTRAINT actor_appearances_movie_fk
        FOREIGN KEY (movie_tmdb_id) REFERENCES movies(tmdb_id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Index for finding all movies an actor appeared in
  pgm.createIndex('actor_appearances', 'actor_tmdb_id', { ifNotExists: true });

  // Index for finding all actors in a movie
  pgm.createIndex('actor_appearances', 'movie_tmdb_id', { ifNotExists: true });

  // Index for filtering by deceased status
  pgm.createIndex('actor_appearances', 'is_deceased', { ifNotExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('actor_appearances');
};
