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
- **Deployment**: Google Kubernetes Engine (GKE)
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
├── k8s/                    # Kubernetes manifests
├── Dockerfile              # Multi-stage Docker build
└── public/                 # Static assets
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies
- `GET /api/movie/{id}` - Get movie with deceased cast
- `GET /api/movie/{id}/death-info?personIds=1,2,3` - Poll for cause of death updates
- `GET /api/on-this-day` - Deaths on current date
- `GET /api/random` - Get a random movie
- `GET /api/discover/{type}` - Get movies by type (classic, high-mortality)
- `GET /api/cursed-movies` - List movies ranked by curse score (paginated)
- `GET /api/cursed-actors` - List actors ranked by co-star mortality (paginated)
- `GET /api/stats` - Get site-wide statistics
- `GET /health` - Health check for Kubernetes

## Database Schema

### Main Tables

```sql
-- Deceased actors discovered through movie lookups
deceased_persons (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birthday DATE,
  deathday DATE NOT NULL,
  cause_of_death TEXT,
  cause_of_death_source TEXT,     -- 'claude', 'wikidata', or 'wikipedia'
  cause_of_death_details TEXT,    -- Detailed explanation for tooltip
  cause_of_death_details_source TEXT,
  wikipedia_url TEXT,
  age_at_death INTEGER,           -- Calculated age when died
  expected_lifespan DECIMAL(5,2), -- Life expectancy based on birth year
  years_lost DECIMAL(5,2),        -- Years lost vs expected lifespan
  updated_at TIMESTAMP DEFAULT NOW()
)

-- US SSA life expectancy data for mortality calculations
actuarial_life_tables (
  birth_year INTEGER, age INTEGER, gender TEXT,
  death_probability DECIMAL(10,8), life_expectancy DECIMAL(6,2)
)

-- Movie cache for mortality statistics
movies (tmdb_id INTEGER, title TEXT, release_year INTEGER,
  expected_deaths DECIMAL(5,2), mortality_surprise_score DECIMAL(6,3))

-- Actor appearances for cross-movie analysis
actor_appearances (actor_tmdb_id INTEGER, movie_tmdb_id INTEGER,
  actor_name TEXT, is_deceased BOOLEAN)
```

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

## Code Standards

- Write unit tests for new functionality (*.test.ts or *.test.tsx)
- Tests must import and test actual production code
- Avoid code duplication - extract repeated logic into functions
- Run format/lint/type-check before committing
