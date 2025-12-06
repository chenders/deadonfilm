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
- `GET /health` - Health check for Kubernetes

## Environment Variables

Create a `.env` file in the `server/` directory:

```
TMDB_API_TOKEN=your_token_here
PORT=8080
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
ANTHROPIC_API_KEY=your_anthropic_key
```

## Database Schema

The app uses PostgreSQL with the following main table:

```sql
deceased_persons (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birthday DATE,
  deathday DATE NOT NULL,
  cause_of_death TEXT,
  cause_of_death_details TEXT,  -- Detailed explanation for tooltip
  wikipedia_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
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
3. Create secrets with TMDB_API_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL
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

### DRY Principle

- Avoid code duplication - extract repeated logic into functions
- Consolidate identical conditional branches
- Refactor when you see duplication

## Pre-Commit Checklist

1. `npm run format && cd server && npm run format`
2. `npm run lint && cd server && npm run lint`
3. `npm run type-check && cd server && npm run type-check`
4. `npm test`
5. Update documentation if necessary
