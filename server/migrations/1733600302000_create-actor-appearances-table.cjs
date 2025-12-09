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
  });

  // Unique constraint on actor_tmdb_id, movie_tmdb_id combination
  pgm.addConstraint('actor_appearances', 'actor_appearances_unique', {
    unique: ['actor_tmdb_id', 'movie_tmdb_id'],
  });

  // Foreign key to movies table
  pgm.addConstraint('actor_appearances', 'actor_appearances_movie_fk', {
    foreignKeys: {
      columns: 'movie_tmdb_id',
      references: 'movies(tmdb_id)',
      onDelete: 'CASCADE',
    },
  });

  // Index for finding all movies an actor appeared in
  pgm.createIndex('actor_appearances', 'actor_tmdb_id');

  // Index for finding all actors in a movie
  pgm.createIndex('actor_appearances', 'movie_tmdb_id');

  // Index for filtering by deceased status
  pgm.createIndex('actor_appearances', 'is_deceased');
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('actor_appearances');
};
