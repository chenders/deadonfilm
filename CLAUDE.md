# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dead on Film is a web application that tracks deceased actors across movies and TV shows. It combines TMDB data with AI-powered death enrichment to provide mortality statistics, cause of death details, discovery pages, and an admin dashboard. The database contains 572,000+ actors across 152,000+ movies and TV shows.

## Common Commands

### Development
- `npm run dev` - Start Docker (DB + Redis), frontend (Vite on :5173), and backend (tsx watch on :8080)
- `npm run dev:frontend` - Vite dev server only
- `npm run dev:server` - Backend only (tsx watch)
- `npm run dev:stop` - Stop Docker containers

### Build
- `npm run build` - TypeScript check + Vite production build
- `npm run build:server` - Server TypeScript compilation (output: `server/dist/`)
- `npm run build:all` - Both frontend and server builds

### Testing
- `npm test` - Vitest (unit/integration)
- `npm run test:coverage` - Vitest with coverage
- `npm run test:e2e` - Playwright end-to-end tests
- `npm run test:all` - Vitest + Playwright

### Code Quality
- `npm run lint` - ESLint
- `npm run format` - Prettier (write)
- `npm run format:check` - Prettier (check only)
- `npm run type-check` - TypeScript without emit

### Database
- `cd server && npm run migrate:up` - Run pending migrations
- `cd server && npm run migrate:down` - Rollback last migration
- `cd server && npm run migrate:create -- migration-name` - Create new migration

## Architecture

### Backend (Node.js/Express/TypeScript)
- **Entry point**: `server/src/index.ts`
- **Worker**: `server/src/worker.ts` (BullMQ job processor)
- **Database**: PostgreSQL 16 via `pg` (raw SQL, no ORM). Connection: `DATABASE_URL`
- **Caching**: Redis 7 via `ioredis`. Connection: `REDIS_URL`
- **Job queue**: BullMQ on separate Redis instance. Connection: `REDIS_JOBS_URL`
- **Routes**: `server/src/routes/` (public API) and `server/src/routes/admin/` (authenticated)
- **Library modules**: `server/src/lib/` — database queries, death sources, biography sources, jobs, mortality stats, entity linker, Claude batch API
- **Scripts**: `server/scripts/` — seeding, backfilling, enrichment, sync, monitoring (most use Commander.js)
- **Migrations**: `server/migrations/*.{cjs,js}` (node-pg-migrate)
- **Logging**: Pino
- **Monitoring**: New Relic APM

### Frontend (React 18/TypeScript/Vite)
- **Entry point**: `src/main.tsx`
- **Routing**: React Router 6 (`src/App.tsx`)
- **Data fetching**: TanStack Query (React Query) — server-side Redis handles caching, client uses `staleTime: 0`
- **Styling**: Tailwind CSS 3 with CSS custom properties for theming (dark mode via `class` strategy)
- **Fonts**: Playfair Display (headings), Inter (body)
- **Build output**: `dist/`
- **Path alias**: `@/*` maps to `./src/*`
- **Vite proxy**: `/api` and `/admin/api` proxy to `localhost:8080`

### Key Directories

```
src/                          # Frontend
├── components/               # React components (admin, causes, common, death, home, movie, search, show, etc.)
├── pages/                    # Page components (56 pages)
├── hooks/                    # Custom hooks (61 hooks)
├── contexts/                 # React contexts
├── services/                 # API service layer
├── types/                    # TypeScript types
└── utils/                    # Utilities

server/src/                   # Backend
├── routes/                   # Express routes (public + admin/)
├── lib/                      # Core library modules
│   ├── death-sources/        # Death enrichment system (orchestrator, 50+ sources, AI providers)
│   ├── biography-sources/    # Biography enrichment system (orchestrator, 19 sources, Claude synthesis)
│   ├── biography/            # Biography utilities (golden test cases, Wikipedia fetcher)
│   ├── jobs/                 # BullMQ queue manager, workers, handlers
│   ├── db/                   # Database query modules
│   ├── claude-batch/         # Claude Batch API integration
│   └── entity-linker/        # Auto-link actor names in text
├── middleware/               # Express middleware
└── test/                     # Test utilities

server/scripts/               # CLI scripts (seeding, backfilling, enrichment)
server/migrations/            # Database migrations (.cjs, .js)
e2e/                          # Playwright tests and screenshots
```

### Key API Routes
- `/api/movie/:id` - Movie details with deceased cast
- `/api/actor/:slug` - Actor profile with filmography
- `/api/show/:id` - TV show details
- `/api/search`, `/api/search/tv` - Search
- `/api/deaths/*` - Death discovery pages (by cause, decade, notable, unnatural)
- `/api/stats/*` - Recent deaths, COVID deaths, featured movie, trivia
- `/admin/api/*` - Admin dashboard (auth required)
- `/admin/api/biography-enrichment/*` - Biography enrichment management

### Key Dependencies

**Backend**: express, pg, ioredis, bullmq, @anthropic-ai/sdk, commander, dotenv, pino, zod, node-pg-migrate, playwright-core (web scraping), newrelic

**Frontend**: react 18, react-router-dom 6, @tanstack/react-query, react-helmet-async, recharts, react-datepicker, slugify

**Build/Test**: vite, typescript, vitest, @playwright/test, @testing-library/react, eslint, prettier, tailwindcss, husky, lint-staged

## Environment Variables

**Required**:
- `TMDB_API_TOKEN` - TMDB API access

**Strongly recommended** (required for AI enrichment / highest quality results):
- `ANTHROPIC_API_KEY` - Claude API for death enrichment and biography enrichment synthesis

**Infrastructure**:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis cache connection (optional in dev; caching is skipped if unavailable)
- `REDIS_JOBS_URL` - Redis for BullMQ jobs (optional in dev; job queue disabled if unavailable)
- `PORT` - Server port (default: 8080)

**Optional** (see `server/.env.example` for full list):
- `OMDB_API_KEY`, `TRAKT_API_KEY` - Ratings data
- `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX`, `BING_SEARCH_API_KEY`, `BRAVE_SEARCH_API_KEY` - Web search for enrichment
- `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `GROQ_API_KEY` - Additional AI providers
- `NEW_RELIC_LICENSE_KEY` - APM monitoring
- `GSC_SERVICE_ACCOUNT_EMAIL`, `GSC_PRIVATE_KEY` - Google Search Console

## Code Quality: Naming and Documentation

When renaming functions, changing APIs, or refactoring modules, **always update all references**:
- **Variable names**: If a function is renamed (e.g., `searchDuckDuckGo` → `webSearch`), rename all variables that referenced the old name (e.g., `ddgResult` → `searchResult`)
- **Code comments**: Update inline comments that reference old names or old behavior
- **Doc comments**: Update JSDoc/TSDoc `@param`, `@returns`, and description text
- **Error messages**: Update user-facing or log error strings (e.g., "No results found via DuckDuckGo" → "No results found via web search")
- **File-level doc blocks**: Update the module description at the top of each file

## Development Notes

- `npm run dev` starts Docker Compose (`docker-compose.dev.yml`) for PostgreSQL on port 5437 and Redis on port 6379, then runs Vite (frontend HMR on :5173) and tsx watch (backend auto-restart on :8080) concurrently
- Vite proxies `/api` and `/admin/api` requests to the backend
- Pre-commit hooks run ESLint and Prettier via husky + lint-staged
- Production runs in Docker containers: app, worker, nginx, cron, PostgreSQL, two Redis instances (cache + jobs)
- Cron jobs: TMDB sync (every 2h), sitemap generation (daily), movie seeding (weekly)

## JavaScript/CommonJS Files

These must remain JS/CJS for tooling compatibility: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `server/migrations/*.cjs`, `server/newrelic.cjs`
