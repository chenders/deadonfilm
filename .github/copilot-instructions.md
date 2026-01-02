# Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Project Overview

**Dead on Film** - A website to look up movies and see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (Neon serverless in production)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Deployment**: Bare-metal Docker with self-hosted GitHub runners
- **Data Sources**: TMDB API, Claude API (cause of death), Wikidata SPARQL (fallback)

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Route pages
│   ├── hooks/              # Custom hooks
│   ├── services/           # API client
│   ├── types/              # TypeScript types
│   └── utils/              # Utility functions
├── server/                 # Express.js backend
│   └── src/
│       ├── index.ts        # Server entry point
│       ├── lib/            # Shared utilities (db, tmdb, wikidata, claude)
│       └── routes/         # API route handlers
├── Dockerfile              # Multi-stage Docker build
└── public/                 # Static assets
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies and TV shows
- `GET /api/movie/{id}` - Get movie with deceased cast
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/show/{id}` - Get TV show with deceased/living cast and mortality stats
- `GET /api/show/{id}/episode/{seasonNumber}/{episodeNumber}` - Get episode details with cast
- `GET /api/on-this-day` - Deaths on current date
- `GET /api/discover/{type}` - Get movies by type (forever-young, etc.)
- `GET /api/cursed-movies` - List movies ranked by curse score (paginated)
- `GET /api/cursed-actors` - List actors ranked by co-star mortality (paginated)
- `GET /api/covid-deaths` - List actors who died from COVID-19 (paginated)
- `GET /api/stats` - Get site-wide statistics
- `GET /health` - Health check for container orchestration

## Database Schema

### Main Tables

```sql
-- Unified actor table (living and deceased)
actors (
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birthday DATE,
  deathday DATE,                  -- NULL for living actors
  profile_path TEXT,
  popularity DECIMAL(10,3),
  cause_of_death TEXT,
  cause_of_death_source TEXT,     -- 'claude', 'wikidata', or 'wikipedia'
  cause_of_death_details TEXT,
  age_at_death INTEGER,
  expected_lifespan DECIMAL(5,2),
  years_lost DECIMAL(5,2),
  violent_death BOOLEAN,
  is_obscure BOOLEAN GENERATED ALWAYS AS (...) STORED
)

-- US SSA life expectancy data for mortality calculations
actuarial_life_tables (
  birth_year INTEGER, age INTEGER, gender TEXT,
  death_probability DECIMAL(10,8), life_expectancy DECIMAL(6,2)
)

-- Movie cache for mortality statistics
movies (tmdb_id INTEGER, title TEXT, release_year INTEGER, original_language TEXT,
  popularity DECIMAL(10,3), expected_deaths DECIMAL(5,2), mortality_surprise_score DECIMAL(6,3))

-- Actor appearances for cross-movie analysis (junction table)
actor_movie_appearances (actor_tmdb_id INTEGER, movie_tmdb_id INTEGER,
  character_name TEXT, billing_order INTEGER, age_at_filming INTEGER)

-- Actor appearances for TV shows (junction table)
actor_show_appearances (actor_tmdb_id INTEGER, show_tmdb_id INTEGER,
  season_number INTEGER, episode_number INTEGER, appearance_type TEXT)
```

Deceased status is derived by checking `actors.deathday IS NOT NULL`.

## Cause of Death Lookup Priority

When looking up cause of death for deceased actors:

1. **Claude API (primary)** - Most accurate, try first
2. **Wikidata SPARQL (fallback)** - If Claude returns null or vague answer
3. **Wikipedia article text (last resort)** - Extract from Death sections

## Development Commands

```bash
# Install dependencies
npm install && cd server && npm install

# Development
npm run dev:all      # Frontend + Backend
npm run dev          # Frontend only (:5173)
npm run dev:server   # Backend only (:8080)

# Quality checks
npm run format && cd server && npm run format
npm run lint && cd server && npm run lint
npm run type-check && cd server && npm run type-check
npm test && cd server && npm test
```

## Mortality Calculation Rules

1. **Archived Footage Exclusion**: Actors who died more than 3 years before a movie's release are excluded from mortality calculations.
2. **Same-Year Death Handling**: Actors who died the same year as the movie release are counted with at least 1 year of death probability.
3. **Curse Score**: `(Actual Deaths - Expected Deaths) / Expected Deaths`. Positive = more deaths than expected.

## Obscure Movie Filtering

The Cursed Movies page filters out obscure/unknown movies by default. A movie is "obscure" if:
- No poster image (`poster_path IS NULL`), OR
- English movies: `popularity < 5.0 AND cast_count < 5`, OR
- Non-English movies: `popularity < 20.0`

Users can toggle "Include obscure movies" checkbox to see all movies.

## CRITICAL: SQL Security - Always Use Parameterized Queries

**NEVER use string interpolation or template literals to build SQL queries with dynamic values.**

```typescript
// BAD - SQL injection vulnerability
const filter = includeObscure ? "" : "AND is_obscure = false"
const result = await db.query(`SELECT * FROM actors WHERE deathday IS NOT NULL ${filter}`)

// GOOD - Use parameterized queries with boolean logic
const result = await db.query(
  `SELECT * FROM actors WHERE deathday IS NOT NULL AND ($1 = true OR is_obscure = false)`,
  [includeObscure]
)
```

## Code Standards

- Write unit tests for new functionality (*.test.ts or *.test.tsx)
- Tests must import and test actual production code
- Avoid code duplication - extract repeated logic into functions
- Run format/lint/type-check before committing
- Use parameterized queries for ALL database operations

## PR Review Policy - MANDATORY

**Test coverage requests are NEVER "out of scope". They must always be implemented.**

When responding to review comments (from humans or automated tools like Copilot):

1. **Test suggestions MUST be implemented** - Not deferred, not dismissed, not "acknowledged as valid but..."
2. **"Out of scope" is NEVER an acceptable response** to a test coverage request
3. **Implement first, then respond** - Write the tests before replying to the comment
4. **Only valid reason to decline**: The test already exists or the suggestion is technically incorrect

### Acceptable responses to test requests:
- "Fixed in [commit]. Added tests for [component]."
- "This test already exists in [file]."

### Unacceptable responses (NEVER use these):
- "Out of scope for this PR"
- "Will address in a follow-up"
- "This is a valid suggestion but..." (followed by not implementing)
- "Adding comprehensive tests is out of scope"

If you find yourself wanting to defer a test, stop and implement it instead.
