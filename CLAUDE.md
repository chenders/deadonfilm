# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Verify Before Providing Specific Details

**Never fabricate specific identifiers, IDs, or URLs.** If you haven't looked something up using a tool (database query, web search, file read), don't provide it as if it's a fact.

Examples of things to verify before stating:
- TMDB IDs (person IDs, movie IDs)
- URLs containing IDs
- Database record values
- API response values

If you don't know a specific value, either:
1. Look it up first (query the database, search the web, read a file)
2. Tell the user you don't know and suggest how they can find it
3. Provide general guidance without the specific value

Do NOT fill in plausible-looking numbers or IDs - there's no such thing as a "plausible" unique identifier.

## Project Overview

**Dead on Film** - A website to look up movies and TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death. Supports both movies (film casts) and TV shows (episode-level actor tracking).

## Cause of Death Lookup Priority

**IMPORTANT**: When looking up cause of death for deceased actors, the priority order is:

1. **Claude API (primary)** - Most accurate, should always be tried first
2. **Wikidata SPARQL (fallback)** - Only if Claude returns null or a vague answer
3. **Wikipedia article text (last resort)** - Extract from Death sections, Personal life, or infobox

Wikipedia should NEVER be the first method used. Claude should always be tried first.

## Mortality Statistics

The app calculates expected mortality for movie casts using US Social Security Administration actuarial life tables. This enables features like:

- **Expected vs Actual Deaths**: Compare how many cast members have died vs how many would be expected based on their ages
- **Mortality Surprise Score**: A metric showing how much higher/lower actual mortality is compared to expected
- **Years Lost**: For deceased actors, calculate how many years they lost compared to life expectancy

### Key Formulas

```
Expected Death Probability:
  For each actor: P(death) = cumulative probability of dying between age at filming and current age
  Expected Deaths = sum of all actor death probabilities

Mortality Surprise Score (Curse Score):
  (Actual Deaths - Expected Deaths) / Expected Deaths
  Positive = more deaths than expected ("cursed" movie)
  Negative = fewer deaths than expected ("blessed" movie)

Years Lost:
  Expected Lifespan - Actual Lifespan
  Uses birth-year-specific cohort life expectancy from US SSA data
  Example: Someone born in 1920 had ~62 year life expectancy vs ~82 for someone born in 2000
  Positive = died early, Negative = lived longer than expected
```

### Mortality Calculation Rules

1. **Archived Footage Exclusion**: Actors who died more than 3 years before a movie's release are excluded from mortality calculations. They appeared via archived footage and weren't alive during production.

2. **Same-Year Death Handling**: Actors who died the same year as the movie release are counted with at least 1 year of death probability to avoid zero-probability edge cases.

3. **Cursed Actors**: Calculated by summing expected and actual co-star deaths across all of an actor's filmography, then computing the curse score.

### Obscure Movie Filtering

The Cursed Movies page filters out obscure/unknown movies by default to improve result quality. A movie is considered "obscure" if any of these conditions apply:

- **No poster image**: `poster_path IS NULL`
- **English movies**: `popularity < 5.0 AND cast_count < 5` (low popularity combined with small cast)
- **Non-English movies**: `popularity < 20.0` (higher threshold since US is the primary demographic)

Users can toggle "Include obscure movies" checkbox to see all movies. This setting is controlled via the `includeObscure` URL parameter.

### Server Libraries

- `server/src/lib/mortality-stats.ts` - Calculation utilities

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (Neon Launch plan - $19/month, 10GB storage)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Deployment**: Google Kubernetes Engine (GKE)
- **Data Sources**: TMDB API, Claude API (primary for cause of death), Wikidata SPARQL (fallback)

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
├── k8s/                    # Kubernetes manifests
│   ├── namespace.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── managed-cert.yaml   # GKE managed SSL certificate
│   ├── cronjob-sync.yaml   # Daily TMDB sync job
│   └── cronjob-seed.yaml   # Weekly movie seeding job
├── Dockerfile              # Multi-stage Docker build
└── public/                 # Static assets
```

## Build Commands

```bash
# Install all dependencies
npm install
cd server && npm install

# Development (run frontend and backend together)
npm run dev:all

# Or run separately:
npm run dev          # Frontend on :5173
npm run dev:server   # Backend on :8080

# Production build
npm run build:all

# Type checking
npm run type-check           # Frontend
cd server && npm run type-check  # Backend

# Linting
npm run lint                 # Frontend
cd server && npm run lint    # Backend

# Formatting
npm run format               # Frontend - auto-fix
cd server && npm run format  # Backend - auto-fix

# Testing
npm test                     # Frontend unit tests
cd server && npm test        # Backend unit tests
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies
- `GET /api/movie/{id}` - Get movie with deceased cast
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/on-this-day` - Deaths on current date
- `GET /api/discover/{type}` - Get a random movie by discovery type (currently: `forever-young`)
- `GET /api/cursed-movies` - List movies ranked by curse score (with pagination/filters, obscure movies hidden by default)
- `GET /api/cursed-movies/filters` - Get filter options for cursed movies (maxMinDeaths)
- `GET /api/cursed-actors` - List actors ranked by co-star mortality (with pagination/filters)
- `GET /api/covid-deaths` - List actors who died from COVID-19 (with pagination)
- `GET /api/stats` - Get site-wide statistics
- `GET /health` - Health check for Kubernetes

### TV Show Endpoints

- `GET /api/show/{id}` - Get TV show with deceased/living cast and mortality stats
- `GET /api/show/{id}/episode/{seasonNumber}/{episodeNumber}` - Get episode details with cast

## Environment Variables

Create a `.env` file in the project root (used by both frontend and backend):

```
# Backend (required)
TMDB_API_TOKEN=your_token_here
PORT=8080
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
ANTHROPIC_API_KEY=your_anthropic_key

# Backend (optional - monitoring)
NEW_RELIC_LICENSE_KEY=your_newrelic_key    # New Relic APM
NEW_RELIC_APP_NAME=Dead on Film            # App name in New Relic

# Frontend (optional - baked in at build time via .env.production)
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX        # Google Analytics 4
VITE_NEW_RELIC_BROWSER_LICENSE_KEY=NRJS-xx # New Relic Browser
VITE_NEW_RELIC_BROWSER_APP_ID=1234567      # New Relic Browser App ID
VITE_NEW_RELIC_BROWSER_ACCOUNT_ID=1234567  # New Relic Account ID
```

Frontend variables must be prefixed with `VITE_` to be exposed to the client.

See `docs/GOOGLE_ANALYTICS.md` and `docs/NEW_RELIC.md` for detailed setup instructions.

## Database Schema

The app uses PostgreSQL with the following tables:

### deceased_persons
Stores information about deceased actors discovered through movie lookups.

```sql
deceased_persons (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birthday DATE,
  deathday DATE NOT NULL,
  cause_of_death TEXT,
  cause_of_death_source TEXT,     -- 'claude', 'wikidata', or 'wikipedia'
  cause_of_death_details TEXT,    -- Detailed explanation for tooltip
  cause_of_death_details_source TEXT,  -- Source of the details
  wikipedia_url TEXT,
  age_at_death INTEGER,           -- Calculated age when died
  expected_lifespan DECIMAL(5,2), -- Life expectancy based on birth year
  years_lost DECIMAL(5,2),        -- Years lost vs expected lifespan
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### actuarial_life_tables
US Social Security Administration period life tables for death probability calculations (used in curse score).

```sql
actuarial_life_tables (
  id SERIAL PRIMARY KEY,
  birth_year INTEGER NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,           -- 'male', 'female', or 'combined'
  death_probability DECIMAL(10,8), -- Probability of dying within this year (qx)
  life_expectancy DECIMAL(6,2),   -- Remaining life expectancy at this age (ex)
  survivors_per_100k INTEGER,     -- Number surviving to this age from 100k births
  UNIQUE(birth_year, age, gender)
)
```

### cohort_life_expectancy
US Social Security Administration cohort life expectancy by birth year (used for years lost calculation).

```sql
cohort_life_expectancy (
  id SERIAL PRIMARY KEY,
  birth_year INTEGER NOT NULL UNIQUE,
  male DECIMAL(4,1) NOT NULL,     -- Life expectancy for males born this year
  female DECIMAL(4,1) NOT NULL,   -- Life expectancy for females born this year
  combined DECIMAL(4,1) NOT NULL  -- Average of male and female
)
```

### movies
Cache of movie metadata for cross-movie analysis and mortality statistics.

```sql
movies (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  release_date DATE,
  release_year INTEGER,
  poster_path TEXT,
  genres TEXT[],
  popularity DECIMAL(10,3),
  vote_average DECIMAL(3,1),
  cast_count INTEGER,
  deceased_count INTEGER,
  living_count INTEGER,
  expected_deaths DECIMAL(5,2),
  mortality_surprise_score DECIMAL(6,3),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### actor_appearances
Links actors to movies for cross-movie analysis (Cursed Actors feature).

```sql
actor_appearances (
  id SERIAL PRIMARY KEY,
  actor_tmdb_id INTEGER NOT NULL,
  movie_tmdb_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  character_name TEXT,
  billing_order INTEGER,
  age_at_filming INTEGER,
  is_deceased BOOLEAN DEFAULT FALSE,
  UNIQUE(actor_tmdb_id, movie_tmdb_id)
)
```

Deceased actor data is persisted to the database and enriched with cause of death information over time.

### sync_state
Tracks the last sync date for TMDB Changes API synchronization (used by `npm run sync:tmdb`).

```sql
sync_state (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL UNIQUE,   -- 'person_changes', 'movie_changes'
  last_sync_date DATE NOT NULL,
  last_run_at TIMESTAMP DEFAULT NOW(),
  items_processed INTEGER DEFAULT 0,
  new_deaths_found INTEGER DEFAULT 0,
  movies_updated INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0
)
```

### TV Show Tables

#### shows
Stores TV show metadata with mortality statistics.

```sql
shows (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  first_air_date DATE,
  last_air_date DATE,
  poster_path TEXT,
  backdrop_path TEXT,
  genres TEXT[],
  status TEXT,                    -- 'Returning Series', 'Ended', 'Canceled'
  number_of_seasons INTEGER,
  number_of_episodes INTEGER,
  popularity DECIMAL(10,3),
  vote_average DECIMAL(3,1),
  original_language TEXT,
  origin_country TEXT[],
  cast_count INTEGER,
  deceased_count INTEGER,
  living_count INTEGER,
  expected_deaths DECIMAL(5,2),
  mortality_surprise_score DECIMAL(6,3),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

#### seasons
Stores season metadata for TV shows.

```sql
seasons (
  id SERIAL PRIMARY KEY,
  show_tmdb_id INTEGER NOT NULL REFERENCES shows(tmdb_id),
  season_number INTEGER NOT NULL,
  name TEXT,
  air_date DATE,
  episode_count INTEGER,
  poster_path TEXT,
  UNIQUE(show_tmdb_id, season_number)
)
```

#### episodes
Stores episode metadata for TV shows.

```sql
episodes (
  id SERIAL PRIMARY KEY,
  show_tmdb_id INTEGER NOT NULL REFERENCES shows(tmdb_id),
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  air_date DATE,
  runtime INTEGER,
  still_path TEXT,
  cast_count INTEGER,
  deceased_count INTEGER,
  guest_star_count INTEGER,
  expected_deaths DECIMAL(5,2),
  mortality_surprise_score DECIMAL(6,3),
  UNIQUE(show_tmdb_id, season_number, episode_number)
)
```

#### show_actor_appearances
Links actors to TV shows at episode level for cross-show analysis.

```sql
show_actor_appearances (
  id SERIAL PRIMARY KEY,
  actor_tmdb_id INTEGER NOT NULL,
  show_tmdb_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  character_name TEXT,
  appearance_type TEXT NOT NULL,  -- 'regular', 'recurring', 'guest'
  billing_order INTEGER,
  is_deceased BOOLEAN DEFAULT FALSE,
  UNIQUE(actor_tmdb_id, show_tmdb_id, season_number, episode_number)
)
```

### Database Migrations

The project uses `node-pg-migrate` for database migrations:

```bash
cd server

# Run pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Create a new migration
npm run migrate:create -- migration-name
```

Migration files are stored in `server/migrations/` as CommonJS files with JSDoc type annotations.

### JavaScript Files and JSDoc

While the application code is written in TypeScript, some files remain as JavaScript/CommonJS for tooling compatibility:

- **Config files** (`eslint.config.js`, `postcss.config.js`, `tailwind.config.js`) - These load before any build step
- **Migration files** (`server/migrations/*.cjs`) - Required by `node-pg-migrate` in CommonJS format
- **New Relic config** (`server/newrelic.cjs`) - Must be CommonJS for the agent to load it

All JavaScript files use JSDoc annotations for type safety and IDE support:

```javascript
// Config files use @type for the default export
/** @type {import('tailwindcss').Config} */
export default {
  // config here gets full autocomplete
}

// Migration files annotate function parameters
/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // pgm methods get full type checking
}
```

When creating new JavaScript files, always add appropriate JSDoc type annotations.

### Database Seeding

Populate the database with deceased actors from top movies by year:

```bash
cd server

# Single year (200 movies, seeds deceased actors only)
npm run seed -- 1995

# Year range (e.g., 1990s)
npm run seed -- 1990 1999

# Seed movies table with mortality statistics (for cursed movies feature)
npm run seed:movies -- 1995                    # Single year, 200 movies
npm run seed:movies -- 1990 1999 --count 500   # 500 movies per year
npm run seed:movies -- --all-time              # All years since 1920

# Seed actuarial life tables (required for death probability calculations)
npm run seed:actuarial

# Seed cohort life expectancy (required for years lost calculations)
npm run seed:cohort

# Backfill mortality statistics for existing deceased actors
npm run backfill:mortality        # Only records with NULL values
npm run backfill:mortality -- --all  # Recalculate all records

# Backfill missing birthdays using Claude
npm run backfill:birthdays

# Backfill missing profile photos from TMDB
npm run backfill:profiles

# Backfill missing language data for movies
npm run backfill:languages                      # Process all movies
npm run backfill:languages -- --batch-size 500  # Limit batch size
npm run backfill:languages -- --dry-run         # Preview without writing

# Sync with TMDB Changes API (detect new deaths, update movies)
npm run sync:tmdb                    # Normal sync (since last run)
npm run sync:tmdb -- --days 7        # Sync specific number of days back
npm run sync:tmdb -- --dry-run       # Preview changes without writing
npm run sync:tmdb -- --people-only   # Only sync people changes
npm run sync:tmdb -- --movies-only   # Only sync movie changes
```

The sync script uses TMDB's Changes API to detect:
- Actors in our database who have died (adds them to deceased_persons)
- Changes to movies in our database (recalculates mortality stats)

A Kubernetes CronJob (`k8s/cronjob-sync.yaml`) runs this every 6 hours (midnight, 6 AM, noon, 6 PM UTC).

## GKE Deployment

**IMPORTANT**: GKE runs on AMD64 architecture. When building on Apple Silicon (ARM), you must specify the target platform to avoid "exec format error":

```bash
docker buildx build --platform linux/amd64 -t IMAGE:TAG --push .
```

### Quick Deploy

```bash
GCP_PROJECT_ID=your-project-id ./scripts/deploy.sh
```

### Manual Deploy

1. Build Docker image for AMD64: `docker buildx build --platform linux/amd64 -t us-central1-docker.pkg.dev/deadonfilm/deadonfilm-repo/dead-on-film:TAG --push .`
2. Apply Kubernetes manifests: `kubectl apply -f k8s/`
3. Create secrets with TMDB_API_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL, and optionally NEW_RELIC_LICENSE_KEY
4. Restart deployment: `kubectl rollout restart deployment/dead-on-film -n deadonfilm`

## URL Structure

Movie URLs use: `/movie/{slug}-{year}-{tmdbId}`
Example: `/movie/breakfast-at-tiffanys-1961-14629`

Show URLs use: `/show/{slug}-{firstAirYear}-{tmdbId}`
Example: `/show/seinfeld-1989-1400`

Episode URLs use: `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}`
Example: `/episode/seinfeld-s1e1-pilot-1400`

## Development Standards

### Code Quality

- Run `npm run format` and `cd server && npm run format` before committing
- Run `npm run lint` and `cd server && npm run lint` to check for errors
- Run `npm run type-check` and `cd server && npm run type-check` for type safety
- Run `npm test` to run frontend unit tests

### Testing

- Write unit tests for new functionality
- Test files go alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import and test actual production code, not reimplementations
- **Test coverage is NEVER out of scope** - Tests for new code MUST be included in the same PR that introduces the code. Do not defer test coverage to a follow-up issue or future PR. If you're adding a new component, page, hook, API route, or utility function, include tests for it in the same PR.
- **data-testid attributes should be added** to all interactive and testable UI elements:
  - Add `data-testid` to components, containers, buttons, inputs, tooltips, modals, and other elements that tests may need to interact with
  - Use descriptive kebab-case names: `data-testid="death-details-trigger"`, `data-testid="search-results-list"`
  - When writing tests, prefer semantic queries (role, text, label) when available. Use `getByTestId` as a fallback when semantic queries are insufficient
  - **Never use CSS class selectors** (`.some-class`) in tests - they are fragile and break when styles change
- Query preference order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` > CSS selectors (avoid)
- **Playwright visual snapshots**: ALWAYS use Docker to generate/update Playwright visual regression snapshots. This ensures CI compatibility since CI runs on Linux:
  ```bash
  # Update snapshots using the Playwright Docker image (match version in package.json)
  docker run --rm -v /path/to/project:/app -w /app --ipc=host \
    mcr.microsoft.com/playwright:v1.57.0-noble \
    sh -c "npm ci && npx playwright test --update-snapshots --grep 'test name'"
  ```
  - Only commit Linux snapshots (`*-linux.png`), never darwin/macOS snapshots
  - Match the Docker image version to the Playwright version in package.json

### CLI Scripts

All CLI scripts in `server/scripts/` use [Commander.js](https://github.com/tj/commander.js) for argument parsing. This provides consistent help output, type-safe options, and proper error handling.

**Standard pattern:**

```typescript
#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from "commander"

// Custom argument validators
function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseYear(value: string): number {
  const year = parsePositiveInt(value)
  if (year < 1900 || year > new Date().getFullYear()) {
    throw new InvalidArgumentError("Must be a valid year")
  }
  return year
}

const program = new Command()
  .name("script-name")
  .description("What the script does")
  .argument("[optional]", "Description", parseYear)
  .argument("<required>", "Description", parsePositiveInt)
  .option("-n, --dry-run", "Preview changes without writing")
  .option("-c, --count <number>", "Number of items", parsePositiveInt, 100)
  .action(async (arg1, arg2, options) => {
    // Validate mutually exclusive options
    if (options.optionA && options.optionB) {
      console.error("Error: Cannot specify both --option-a and --option-b")
      process.exit(1)
    }
    await runScript(options)
  })

program.parse()
```

**Key conventions:**

- Use `InvalidArgumentError` for argument validation errors (Commander shows them nicely)
- Validate mutually exclusive options in the action handler
- Use optional arguments with `[brackets]`, required with `<brackets>`
- Provide sensible defaults via the fourth parameter to `.option()`
- Always call `program.parse()` at the end

### DRY Principle

- Avoid code duplication - extract repeated logic into functions
- Consolidate identical conditional branches
- Refactor when you see duplication

### Pull Request Descriptions

When creating a PR, include screenshots to illustrate UI changes:

- **Before/After screenshots**: If making visual changes, include both before and after screenshots showing the difference
- **After-only screenshots**: If before screenshots aren't available (e.g., new feature), include after screenshots showing the new functionality
- **E2E test screenshots**: Reference any relevant screenshots from `e2e/screenshots/` directory
- **Screenshot format in PR**: Use relative paths from repo root: `![Description](./e2e/screenshots/filename.png)`
- **Multiple viewports**: Include both desktop and mobile screenshots when the change affects responsive layouts

## Pre-Commit Checklist

1. `npm run format && cd server && npm run format`
2. `npm run lint && cd server && npm run lint`
3. `npm run type-check && cd server && npm run type-check`
4. `npm test && cd server && npm test` (frontend and backend unit tests)
5. Update documentation if necessary

## Git Commit Messages

**IMPORTANT**: When writing multi-line commit messages, use simple double-quoted strings with `\n` for newlines. Do NOT use heredocs (`<<EOF`) inside command substitution (`$(...)`) as this causes shell parsing errors with special characters like apostrophes.

**Correct approach:**
```bash
git commit -m "Short summary

Longer description here. Avoid apostrophes or escape them.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Do NOT do this** (causes shell errors):
```bash
git commit -m "$(cat <<'EOF'
Message with apostrophe's will break
EOF
)"
```

## Shell Command Guidelines

When running background commands with `&`, always chain subsequent commands properly:

**Correct approach:**
```bash
# Use && to chain commands after backgrounding
npm run dev:all 2>&1 & sleep 3 && curl http://localhost:8080/health

# Or run commands separately
npm run dev:all &
# (wait for output, then run next command separately)
curl http://localhost:8080/health
```

**Do NOT do this** (shell parsing error):
```bash
npm run dev:all 2>&1 &
sleep 3
curl http://localhost:8080/health
```
The above causes `sleep` to receive "3", "curl", "http://..." as arguments because newlines after `&` don't properly separate commands in background execution context.
