/**
 * Migration: Create movies table
 *
 * Cache of movie metadata to enable cross-movie analysis.
 * Stores TMDB movie data along with calculated mortality statistics.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('movies', {
    id: 'id',
    tmdb_id: { type: 'integer', notNull: true, unique: true },
    title: { type: 'text', notNull: true },
    release_date: { type: 'date' },
    release_year: { type: 'integer' },
    poster_path: { type: 'text' },
    genres: { type: 'text[]' },
    popularity: { type: 'decimal(10,3)' },
    vote_average: { type: 'decimal(3,1)' },
    cast_count: { type: 'integer' },
    deceased_count: { type: 'integer' },
    living_count: { type: 'integer' },
    expected_deaths: { type: 'decimal(5,2)' },
    mortality_surprise_score: { type: 'decimal(6,3)' },
    created_at: { type: 'timestamp', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamp', default: pgm.func('NOW()') },
  });

  // Index for efficient lookups
  pgm.createIndex('movies', 'tmdb_id');
  pgm.createIndex('movies', 'release_year');
  pgm.createIndex('movies', 'mortality_surprise_score');
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('movies');
};
