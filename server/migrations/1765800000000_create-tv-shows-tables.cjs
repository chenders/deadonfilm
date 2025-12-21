/**
 * Migration: Create TV shows tables
 *
 * Creates tables for TV show support:
 * - shows: Main show metadata (equivalent to movies table)
 * - seasons: Season-level data
 * - episodes: Episode-level data
 * - show_actor_appearances: Actor appearances at episode level
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create shows table (equivalent to movies table)
  pgm.createTable('shows', {
    id: 'id',
    tmdb_id: { type: 'integer', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    first_air_date: { type: 'date' },
    last_air_date: { type: 'date' },
    poster_path: { type: 'text' },
    backdrop_path: { type: 'text' },
    genres: { type: 'text[]' },
    status: { type: 'text' }, // 'Returning Series', 'Ended', 'Canceled'
    number_of_seasons: { type: 'integer' },
    number_of_episodes: { type: 'integer' },
    popularity: { type: 'decimal(10,3)' },
    vote_average: { type: 'decimal(3,1)' },
    origin_country: { type: 'text[]' },
    original_language: { type: 'text' },
    cast_count: { type: 'integer' }, // Total unique actors across all episodes
    deceased_count: { type: 'integer' },
    living_count: { type: 'integer' },
    expected_deaths: { type: 'decimal(5,2)' },
    mortality_surprise_score: { type: 'decimal(6,3)' },
    created_at: { type: 'timestamp', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamp', default: pgm.func('NOW()') },
  }, { ifNotExists: true });

  // Indexes for shows
  pgm.createIndex('shows', 'tmdb_id', { ifNotExists: true });
  pgm.createIndex('shows', 'first_air_date', { ifNotExists: true });
  pgm.createIndex('shows', 'mortality_surprise_score', { ifNotExists: true });
  pgm.createIndex('shows', 'original_language', { ifNotExists: true });

  // Create seasons table
  pgm.createTable('seasons', {
    id: 'id',
    show_tmdb_id: { type: 'integer', notNull: true },
    season_number: { type: 'integer', notNull: true },
    name: { type: 'text' },
    air_date: { type: 'date' },
    episode_count: { type: 'integer' },
    poster_path: { type: 'text' },
    cast_count: { type: 'integer' },
    deceased_count: { type: 'integer' },
    expected_deaths: { type: 'decimal(5,2)' },
    mortality_surprise_score: { type: 'decimal(6,3)' },
  }, { ifNotExists: true });

  // Unique constraint on show_tmdb_id, season_number
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE seasons ADD CONSTRAINT seasons_unique UNIQUE (show_tmdb_id, season_number);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Foreign key to shows table
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE seasons ADD CONSTRAINT seasons_show_fk
        FOREIGN KEY (show_tmdb_id) REFERENCES shows(tmdb_id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  pgm.createIndex('seasons', 'show_tmdb_id', { ifNotExists: true });

  // Create episodes table
  pgm.createTable('episodes', {
    id: 'id',
    show_tmdb_id: { type: 'integer', notNull: true },
    season_number: { type: 'integer', notNull: true },
    episode_number: { type: 'integer', notNull: true },
    name: { type: 'text' },
    air_date: { type: 'date' },
    runtime: { type: 'integer' },
    cast_count: { type: 'integer' },
    deceased_count: { type: 'integer' },
    guest_star_count: { type: 'integer' },
    expected_deaths: { type: 'decimal(5,2)' },
    mortality_surprise_score: { type: 'decimal(6,3)' },
  }, { ifNotExists: true });

  // Unique constraint on show_tmdb_id, season_number, episode_number
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE episodes ADD CONSTRAINT episodes_unique UNIQUE (show_tmdb_id, season_number, episode_number);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Foreign key to shows table
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE episodes ADD CONSTRAINT episodes_show_fk
        FOREIGN KEY (show_tmdb_id) REFERENCES shows(tmdb_id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  pgm.createIndex('episodes', 'show_tmdb_id', { ifNotExists: true });
  pgm.createIndex('episodes', ['show_tmdb_id', 'season_number'], { ifNotExists: true });

  // Create show_actor_appearances table
  pgm.createTable('show_actor_appearances', {
    id: 'id',
    actor_tmdb_id: { type: 'integer', notNull: true },
    show_tmdb_id: { type: 'integer', notNull: true },
    season_number: { type: 'integer', notNull: true },
    episode_number: { type: 'integer', notNull: true },
    actor_name: { type: 'text', notNull: true },
    character_name: { type: 'text' },
    appearance_type: { type: 'text', notNull: true }, // 'regular', 'recurring', 'guest'
    billing_order: { type: 'integer' },
    age_at_filming: { type: 'integer' },
    is_deceased: { type: 'boolean', default: false },
  }, { ifNotExists: true });

  // Unique constraint on actor_tmdb_id, show_tmdb_id, season_number, episode_number
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE show_actor_appearances ADD CONSTRAINT show_actor_appearances_unique
        UNIQUE (actor_tmdb_id, show_tmdb_id, season_number, episode_number);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Foreign key to shows table
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE show_actor_appearances ADD CONSTRAINT show_actor_appearances_show_fk
        FOREIGN KEY (show_tmdb_id) REFERENCES shows(tmdb_id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Indexes for efficient queries
  pgm.createIndex('show_actor_appearances', 'actor_tmdb_id', {
    ifNotExists: true,
    name: 'idx_show_appearances_actor'
  });
  pgm.createIndex('show_actor_appearances', 'show_tmdb_id', {
    ifNotExists: true,
    name: 'idx_show_appearances_show'
  });
  pgm.createIndex('show_actor_appearances', ['show_tmdb_id', 'season_number', 'episode_number'], {
    ifNotExists: true,
    name: 'idx_show_appearances_episode'
  });
  pgm.createIndex('show_actor_appearances', 'is_deceased', { ifNotExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('show_actor_appearances');
  pgm.dropTable('episodes');
  pgm.dropTable('seasons');
  pgm.dropTable('shows');
};
