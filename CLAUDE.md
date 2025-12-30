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

## CRITICAL: SQL Security - Always Use Parameterized Queries

**NEVER use string interpolation or template literals to build SQL queries with dynamic values.** This creates SQL injection vulnerabilities.

### Bad (NEVER do this):
```typescript
// String interpolation - DANGEROUS
const filter = includeObscure ? "" : "AND is_obscure = false"
const result = await db.query(`SELECT * FROM actors WHERE deathday IS NOT NULL ${filter}`)

// Template literal with values - DANGEROUS
const result = await db.query(`SELECT * FROM actors WHERE id = ${userId}`)
```

### Good (ALWAYS do this):
```typescript
// Use parameterized queries with boolean logic
const result = await db.query(
  `SELECT * FROM actors WHERE deathday IS NOT NULL AND ($1 = true OR is_obscure = false)`,
  [includeObscure]
)

// All dynamic values as parameters
const result = await db.query(`SELECT * FROM actors WHERE id = $1`, [userId])
```

### The Pattern for Optional Filters:
When you need a filter that can be toggled on/off, use this pattern:
```typescript
// Instead of: ${includeAll ? "" : "AND status = 'active'"}
// Use: AND ($N = true OR status = 'active')
```

This rule applies even when the interpolated value is a hardcoded string derived from code logic. Always use parameterized queries.

## Project Overview

**Dead on Film** - A website to look up movies and TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death. Supports both movies (film casts) and TV shows (episode-level actor tracking).

## Cause of Death Lookup Priority

**IMPORTANT**: When looking up cause of death for deceased actors, the priority order is:

1. **Claude API (primary)** - Most accurate, should always be tried first
2. **Wikidata SPARQL (fallback)** - Only if Claude returns null or a vague answer
3. **Wikipedia article text (last resort)** - Extract from Death sections, Personal life, or infobox

Wikipedia should NEVER be the first method used. Claude should always be tried first.

## Mortality Statistics

The app calculates expected mortality for movie and TV show casts using US Social Security Administration actuarial life tables. This enables features like:

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

1. **Archived Footage Exclusion**: Actors who died more than 3 years before a movie or show's release are excluded from mortality calculations. They appeared via archived footage and weren't alive during production.

2. **Same-Year Death Handling**: Actors who died the same year as the movie release are counted with at least 1 year of death probability to avoid zero-probability edge cases.

3. **Cursed Actors**: Calculated by summing expected and actual co-star deaths across all of an actor's filmography, then computing the curse score.

### Obscure Movie Filtering

The Cursed Movies page filters out obscure/unknown movies by default to improve result quality. A movie is considered "obscure" if any of these conditions apply:

- **No poster image**: `poster_path IS NULL`
- **English movies**: `popularity < 5.0 AND cast_count < 5` (low popularity combined with small cast)
- **Non-English movies**: `popularity < 20.0` (higher threshold since US is the primary demographic)

This logic is implemented as a **computed column** (`is_obscure BOOLEAN GENERATED ALWAYS AS ... STORED`) in the movies table for efficient querying. A partial index (`idx_movies_not_obscure_curse`) covers non-obscure movies.

Users can toggle "Include obscure movies" checkbox to see all movies. This setting is controlled via the `includeObscure` URL parameter.

### Obscure Actor Filtering

Similarly, deceased actors can be filtered as "obscure" to improve result quality. An actor is considered **NOT obscure** if ANY of these conditions are true:

- **Hit movie**: Has appeared in a movie with popularity >= 20
- **Hit TV show**: Has appeared in a TV show with popularity >= 20
- **Established in English film market**: Has 3+ English movies with popularity >= 5
- **Established in English TV market**: Has 3+ English TV shows with popularity >= 5
- **Prolific film actor**: Has 10+ movies total
- **Prolific TV actor**: Has 50+ TV episodes total

This logic considers both movie and TV appearances, and naturally prioritizes actors recognizable to an English-speaking audience while still including internationally famous foreign actors.

The `is_obscure` column in the `actors` table is a regular boolean column updated by the backfill script: `npm run backfill:actor-obscure`.

### Server Libraries

- `server/src/lib/mortality-stats.ts` - Calculation utilities

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL 16 (containerized)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Deployment**: Docker on bare-metal with Cloudflare Tunnel
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
├── docker-compose.prod.yml # Production Docker Compose
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
- `GET /health` - Health check endpoint

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

### actors
Unified table for all actors (both living and deceased). Death-related fields are NULL for living actors.

```sql
actors (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birthday DATE,
  deathday DATE,                  -- NULL for living actors
  profile_path TEXT,
  popularity DECIMAL(10,3),

  -- Death fields (NULL for living actors)
  cause_of_death TEXT,
  cause_of_death_source TEXT,     -- 'claude', 'wikidata', or 'wikipedia'
  cause_of_death_details TEXT,    -- Detailed explanation for tooltip
  cause_of_death_details_source TEXT,
  wikipedia_url TEXT,
  age_at_death INTEGER,
  expected_lifespan DECIMAL(5,2),
  years_lost DECIMAL(5,2),
  violent_death BOOLEAN,

  -- Computed column for filtering obscure actors
  is_obscure BOOLEAN GENERATED ALWAYS AS (
    profile_path IS NULL OR COALESCE(popularity, 0) < 5.0
  ) STORED,

  created_at TIMESTAMP DEFAULT NOW(),
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
  original_language TEXT,
  popularity DECIMAL(10,3),
  vote_average DECIMAL(3,1),
  cast_count INTEGER,
  deceased_count INTEGER,
  living_count INTEGER,
  expected_deaths DECIMAL(5,2),
  mortality_surprise_score DECIMAL(6,3),
  is_obscure BOOLEAN GENERATED ALWAYS AS (...) STORED, -- Computed column for filtering
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### actor_movie_appearances
Junction table linking actors to movies. Actor metadata is stored in the `actors` table.

```sql
actor_movie_appearances (
  id SERIAL PRIMARY KEY,
  actor_tmdb_id INTEGER NOT NULL,
  movie_tmdb_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  character_name TEXT,
  billing_order INTEGER,
  age_at_filming INTEGER,
  UNIQUE(actor_tmdb_id, movie_tmdb_id)
)
```

Actor data (including death information) is stored in the unified `actors` table. Deceased status is derived by checking `actors.deathday IS NOT NULL`.

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

#### actor_show_appearances
Junction table linking actors to TV shows at episode level. Actor metadata is stored in the `actors` table.

```sql
actor_show_appearances (
  id SERIAL PRIMARY KEY,
  actor_tmdb_id INTEGER NOT NULL,
  show_tmdb_id INTEGER NOT NULL REFERENCES shows(tmdb_id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  character_name TEXT,
  appearance_type TEXT NOT NULL,  -- 'regular', 'recurring', 'guest'
  billing_order INTEGER,
  age_at_filming INTEGER,
  UNIQUE(actor_tmdb_id, show_tmdb_id, season_number, episode_number)
)
```

Deceased status for TV show appearances is derived by joining with `actors WHERE deathday IS NOT NULL`.

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

# Backfill popularity for deceased actors (enables obscure filtering)
npm run backfill:actor-obscure                  # Backfill actors missing popularity
npm run backfill:actor-obscure -- --all         # Refresh all actors
npm run backfill:actor-obscure -- --stats       # Show obscure statistics only
npm run backfill:actor-obscure -- --dry-run     # Preview without writing

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

A cron container (see `docker-compose.prod.yml`) runs scheduled jobs including TMDB sync every 2 hours.

## Production Deployment

The app runs on a bare-metal server using Docker with Cloudflare Tunnel for SSL/routing.

### Architecture

- **Container Registry**: GitHub Container Registry (ghcr.io)
- **App Container**: nginx (port 3000) serves frontend and proxies API to Express (port 8080)
- **Cron Container**: Runs scheduled jobs with supercronic (TMDB sync, sitemap generation, movie seeding)
- **SSL/Routing**: Cloudflare Tunnel points to localhost:3000

### GitHub Actions Deployment

Deployment is automatic on merge to main (after CI passes):
1. Self-hosted runner builds and pushes image to ghcr.io
2. Runner deploys locally using `docker compose pull && docker compose up -d`
3. Health check verifies deployment success

### Manual Deployment

```bash
cd /opt/deadonfilm

# Pull latest and deploy
docker compose pull
docker compose up -d

# Check status
docker compose ps
docker compose logs -f app

# Rollback to specific commit
IMAGE_TAG=abc1234 docker compose up -d
```

### Server Setup

See `docs/SERVER_SETUP.md` for initial server configuration including:
- GitHub self-hosted runner installation
- Cloudflare Tunnel setup
- Environment variable configuration

## URL Structure

Movie URLs use: `/movie/{slug}-{year}-{tmdbId}`
Example: `/movie/breakfast-at-tiffanys-1961-14629`

Show URLs use: `/show/{slug}-{firstAirYear}-{tmdbId}`
Example: `/show/seinfeld-1989-1400`

Episode URLs use: `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}`
Example: `/episode/seinfeld-s1e1-pilot-1400`

## Development Standards

### Sitemap Updates

**IMPORTANT**: When adding a new page or URL route to the application, you MUST update the sitemap:

1. **Static pages** (discovery pages, landing pages): Add to the `staticPages` array in `server/src/routes/sitemap.ts`
2. **Dynamic pages** (movie/show/actor detail pages): Add a query and loop to generate URLs in `server/src/routes/sitemap.ts`
3. **Slug utilities**: If the new page type needs a slug, add the function to `server/src/lib/slug-utils.ts`

The sitemap is located at `server/src/routes/sitemap.ts` and generates `/sitemap.xml` for SEO.

### Code Quality

- Run `npm run format` and `cd server && npm run format` before committing
- Run `npm run lint` and `cd server && npm run lint` to check for errors
- Run `npm run type-check` and `cd server && npm run type-check` for type safety
- Run `npm test` to run frontend unit tests

### Testing

**CRITICAL: A PR is NOT ready for review until it includes tests for all new/changed code.**

- Write unit tests for new functionality - this is a hard requirement, not optional
- Test files go alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import and test actual production code, not reimplementations
- **Test coverage is NEVER out of scope** - Tests for new code MUST be included in the same PR that introduces the code. Do not defer test coverage to a follow-up issue or future PR. If you're adding a new component, page, hook, API route, or utility function, include tests for it in the same PR.
- **MANDATORY: When a reviewer (human or automated like Copilot) requests test coverage, you MUST implement those tests.** Responding with "out of scope" or "will address in a follow-up" is NOT acceptable. Test requests are always valid and always in scope.
- **Before creating a PR**, verify you have written tests that cover:
  - Happy path (normal operation)
  - Error handling (database errors, API failures, invalid input)
  - Edge cases (empty results, pagination boundaries, null values)
  - All branching logic in the new code
- **data-testid attributes should be added** to all interactive and testable UI elements:
  - Add `data-testid` to components, containers, buttons, inputs, tooltips, modals, and other elements that tests may need to interact with
  - Use descriptive kebab-case names: `data-testid="death-details-trigger"`, `data-testid="search-results-list"`
  - When writing tests, prefer semantic queries (role, text, label) when available. Use `getByTestId` as a fallback when semantic queries are insufficient
  - **Never use CSS class selectors** (`.some-class`) in tests - they are fragile and break when styles change
- Query preference order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` > CSS selectors (avoid)
- **Test all conditional UI states**: When UI text or elements change based on state/props (e.g., checkbox toggles, filters, loading states), write tests for EACH condition:
  ```typescript
  // BAD: Only tests default state
  it("renders description", async () => {
    expect(screen.getByText(/some description/)).toBeInTheDocument()
  })

  // GOOD: Tests both states of a toggle
  it("shows filtered description when unchecked", async () => {
    expect(screen.getByText(/without optional content/)).toBeInTheDocument()
    expect(screen.queryByText(/optional content/)).not.toBeInTheDocument()
  })

  it("shows full description when checked", async () => {
    fireEvent.click(screen.getByRole("checkbox"))
    expect(screen.getByText(/with optional content/)).toBeInTheDocument()
  })
  ```
- **Playwright visual snapshots**: ALWAYS use Docker to generate/update Playwright visual regression snapshots. This ensures CI compatibility since CI runs on Linux:
  ```bash
  # Update snapshots using the Playwright Docker image (match version in package.json)
  docker run --rm -v /path/to/project:/app -w /app --ipc=host \
    mcr.microsoft.com/playwright:v1.57.0-noble \
    sh -c "npm ci && npx playwright test --update-snapshots --grep 'test name'"
  ```
  - Only commit Linux snapshots (`*-linux.png`), never darwin/macOS snapshots
  - Match the Docker image version to the Playwright version in package.json

### Responding to Automated Review Comments (Copilot, etc.)

When GitHub Copilot or other automated reviewers suggest adding tests:

1. **NEVER dismiss test suggestions as "out of scope"** - Test coverage is always in scope
2. **NEVER defer test coverage to a follow-up PR or issue** - Implement the tests now
3. **Implement the requested tests** before responding to the comment
4. **Only decline a test suggestion if it's technically invalid** (e.g., testing a function that doesn't exist, or the test already exists)

**Acceptable responses to test coverage requests:**
- "Fixed in [commit]. Added tests for [component/function]."
- "This test already exists in [file]."

**Unacceptable responses:**
- "Out of scope for this PR"
- "Will address in a follow-up"
- "This is a valid suggestion but..."
- Any response that acknowledges validity but doesn't implement

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

**IMPORTANT**: When creating a PR that includes UI changes, you MUST:

1. **Take screenshots** of all affected UI areas using Playwright or the browser
2. **Commit screenshots** to the `e2e/screenshots/` directory
3. **Include screenshots in the PR description** using GitHub raw URLs
4. **Verify screenshots are visible** by checking the PR on GitHub after creating it

#### Screenshot Requirements

- **Before/After screenshots**: If making visual changes, include both before and after screenshots showing the difference
- **After-only screenshots**: If before screenshots aren't available (e.g., new feature), include after screenshots showing the new functionality
- **Multiple viewports**: Include both desktop and mobile screenshots when the change affects responsive layouts

#### Taking Screenshots with Playwright

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:5173/your-page');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500); // Allow animations to complete
await page.screenshot({ path: 'e2e/screenshots/feature-name.png' });

await browser.close();
```

#### Including Screenshots in PR Description

**IMPORTANT: Do NOT use relative paths like `./e2e/screenshots/...` - they will appear as broken images on GitHub!**

Use GitHub raw URLs so screenshots display correctly:

```markdown
## Screenshots

### Feature Name
![Feature Name](https://raw.githubusercontent.com/chenders/deadonfilm/{commit-sha}/e2e/screenshots/feature-name.png)
```

**Get the commit SHA** after pushing: `git rev-parse HEAD`

#### Verification Checklist

After creating the PR, verify on GitHub that:
- [ ] All screenshot images load and display correctly
- [ ] Screenshots show the actual UI changes (not loading states or errors)
- [ ] Image URLs use the correct commit SHA from the pushed branch

## Pre-Commit Checklist

1. `npm run format && cd server && npm run format`
2. `npm run lint && cd server && npm run lint`
3. `npm run type-check && cd server && npm run type-check`
4. `npm test && cd server && npm test` (frontend and backend unit tests)
5. Update documentation if necessary

## Git Branching Strategy

**IMPORTANT**: Never commit directly to `main` or push to `main`. All work must go through pull requests.

1. **Always create a feature branch** for any new work:
   ```bash
   git checkout -b feat/feature-name   # New features
   git checkout -b fix/bug-name        # Bug fixes
   git checkout -b chore/task-name     # Maintenance tasks
   git checkout -b docs/docs-change    # Documentation updates
   ```

2. **Push the branch and create a PR**:
   ```bash
   git push -u origin feat/feature-name
   gh pr create --title "Description" --body "Details"
   ```

3. **Never push directly to main** - The repository has branch protection rules that will reject direct pushes anyway.

4. If you accidentally commit to main locally, move the commit to a new branch:
   ```bash
   git checkout -b feat/new-branch     # Create branch with your commits
   git checkout main
   git reset --hard origin/main        # Reset main to match remote
   git checkout feat/new-branch        # Go back to your branch
   ```

## Plan Files Cleanup

**IMPORTANT**: After implementing a plan, delete the plan file from `~/.claude/plans/`. Plan files are only useful during active planning and implementation - once the work is complete, they become stale and can cause confusion in future sessions.

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
