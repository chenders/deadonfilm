# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dead on Film** - A website to look up movies and see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

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
  Expected Lifespan - Actual Lifespan (based on life expectancy at birth)
```

### Mortality Calculation Rules

1. **Archived Footage Exclusion**: Actors who died more than 3 years before a movie's release are excluded from mortality calculations. They appeared via archived footage and weren't alive during production.

2. **Same-Year Death Handling**: Actors who died the same year as the movie release are counted with at least 1 year of death probability to avoid zero-probability edge cases.

3. **Cursed Actors**: Calculated by summing expected and actual co-star deaths across all of an actor's filmography, then computing the curse score.

### Server Libraries

- `server/src/lib/mortality-stats.ts` - Calculation utilities
- `server/data/actuarial-life-tables.json` - SSA Period Life Tables (2022)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (Neon serverless in production)
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
│   └── managed-cert.yaml   # GKE managed SSL certificate
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
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies
- `GET /api/movie/{id}` - Get movie with deceased cast
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/on-this-day` - Deaths on current date
- `GET /api/random` - Get a random movie (redirects to movie page)
- `GET /api/discover/{type}` - Get movies by type (classic, high-mortality)
- `GET /api/cursed-movies` - List movies ranked by curse score (with pagination/filters)
- `GET /api/cursed-movies/filters` - Get filter options for cursed movies
- `GET /api/cursed-actors` - List actors ranked by co-star mortality (with pagination/filters)
- `GET /api/stats` - Get site-wide statistics
- `GET /health` - Health check for Kubernetes

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
US Social Security Administration life expectancy data for mortality calculations.

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

Migration files are stored in `server/migrations/` as CommonJS files.

### Database Seeding

Populate the database with deceased actors from top movies by year:

```bash
cd server

# Single year
npm run seed -- 1995

# Year range (e.g., 1990s)
npm run seed -- 1990 1999

# Seed actuarial life tables (required for mortality statistics)
npm run seed:actuarial
```

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
4. Restart deployment: `kubectl rollout restart deployment/dead-on-film -n dead-on-film`

## URL Structure

Movie URLs use: `/movie/{slug}-{year}-{tmdbId}`
Example: `/movie/breakfast-at-tiffanys-1961-14629`

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
- **data-testid attributes should be added** to all interactive and testable UI elements:
  - Add `data-testid` to components, containers, buttons, inputs, tooltips, modals, and other elements that tests may need to interact with
  - Use descriptive kebab-case names: `data-testid="death-details-trigger"`, `data-testid="search-results-list"`
  - When writing tests, prefer semantic queries (role, text, label) when available. Use `getByTestId` as a fallback when semantic queries are insufficient
  - **Never use CSS class selectors** (`.some-class`) in tests - they are fragile and break when styles change
- Query preference order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` > CSS selectors (avoid)

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
4. `npm test`
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
