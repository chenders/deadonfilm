# Copilot Reference — Extended Documentation

Detailed reference material for the Dead on Film project. This file is NOT injected into
Copilot's review context — see `.github/copilot-instructions.md` for the focused review rules.

---

## Project Overview

**Dead on Film** — A web application that tracks deceased actors across movies and TV shows. Combines TMDB data with AI-powered death enrichment to provide mortality statistics, cause of death details, discovery pages, and an admin dashboard. The database contains 572,000+ actors across 152,000+ movies and TV shows.

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router 6 |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 (raw SQL via `pg`, no ORM) |
| Caching | Redis 7 via `ioredis` |
| Job Queue | BullMQ on separate Redis instance |
| Data Sources | TMDB API, Claude API, Wikidata SPARQL, 60+ enrichment sources |
| Monitoring | New Relic APM, Pino logging |

### URL Patterns

| Type | Pattern |
|------|---------|
| Actor | `/actor/{slug}-{actorId}` (uses internal `actor.id`) |
| Movie | `/movie/{slug}-{year}-{tmdbId}` |
| Show | `/show/{slug}-{firstAirYear}-{tmdbId}` |
| Episode | `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}` |

**Note**: Actor URLs use the internal `actor.id` (not `tmdb_id`) to avoid ID overlap issues. Legacy URLs with `tmdb_id` are automatically redirected via 301.

---

## Architecture

### Backend (Node.js/Express/TypeScript)
- **Entry point**: `server/src/index.ts`
- **Worker**: `server/src/worker.ts` (BullMQ job processor)
- **Routes**: `server/src/routes/` (public API) and `server/src/routes/admin/` (authenticated)
- **Library modules**: `server/src/lib/` — database queries, death sources, biography sources, jobs, mortality stats, entity linker, Claude batch API
- **Scripts**: `server/scripts/` — seeding, backfilling, enrichment, sync, monitoring (most use Commander.js)
- **Migrations**: `server/migrations/*.{cjs,js}` (node-pg-migrate)

### Frontend (React 18/TypeScript/Vite)
- **Entry point**: `src/main.tsx`
- **Routing**: React Router 6 (`src/App.tsx`)
- **Data fetching**: TanStack Query — server-side Redis handles caching, client uses `staleTime: 0`
- **Styling**: Tailwind CSS 3 with CSS custom properties for theming (dark mode via `class` strategy)
- **Build output**: `dist/`
- **Path alias**: `@/*` maps to `./src/*`
- **Vite proxy**: `/api` and `/admin/api` proxy to `localhost:8080`

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `actors` | All actors, death info, popularity. **`tmdb_id` is nullable.** |
| `movies` / `shows` / `episodes` | Content metadata with mortality stats |
| `actor_movie_appearances` / `actor_show_appearances` | Links actors to content via `actor_id` (primary key) |
| `actor_death_circumstances` | Enriched death details: narrative, sources, confidence |
| `actor_biography_details` | Enriched biography: narrative, teaser, family, education, factors |
| `biography_legacy` | One-time archive of old biography text before first enrichment |
| `actuarial_life_tables` / `cohort_life_expectancy` | SSA mortality data |
| `enrichment_runs` / `enrichment_run_actors` | Enrichment batch tracking |

**Important**: Always join actors using `actor_id`, never `tmdb_id`. The `tmdb_id` field can be NULL for actors from non-TMDB sources.

---

## Development Commands

```bash
npm run dev          # Frontend + Backend (starts Docker containers + HMR)
npm run dev:stop     # Stop Docker containers
npm run format && cd server && npm run format
npm run lint && cd server && npm run lint
npm run type-check && cd server && npm run type-check
npm test
npm run build        # TypeScript check + Vite production build
npm run build:all    # Frontend + server builds
cd server && npm run migrate:up      # Run pending migrations
cd server && npm run migrate:down    # Rollback last migration
cd server && npm run migrate:create -- migration-name  # Create new
```

---

## Git Workflow

**NEVER commit directly to `main`** — always use feature branches.

### Commit Format

**ALWAYS use heredoc for multiline commit messages**:

```bash
git commit -m "$(cat <<'EOF'
Short summary

Longer description here.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

For detailed GitHub CLI operations, see `.claude/rules/github-cli.md` and `.claude/rules/pr-screenshots.md`.

---

## Mortality Calculations

| Formula | Description |
|---------|-------------|
| Expected Deaths | Sum of death probabilities for each actor (filming age to current age) |
| Years Lost | `Expected Lifespan - Actual Lifespan`. Positive = died early |

### Obscure Filtering

A movie is "obscure" if: no poster, OR (English + popularity <5 + cast <5), OR (non-English + popularity <20).

---

## Death Enrichment

Sources tried in priority order, stopping at confidence threshold (0.5):
1. Structured Data (free) — Wikidata, Wikipedia, BFI
2. Web Search — Google, Bing, DuckDuckGo, Brave
3. News Sources — Guardian, NYTimes, AP, Reuters, Washington Post, LA Times, NPR, BBC, etc.
4. Obituary Sites — Find a Grave, Legacy.com
5. Historical Archives — Trove, Europeana, Internet Archive
6. Genealogy — FamilySearch
7. AI Models (optional, by cost) — Gemini Flash through GPT-4o

See `.claude/rules/death-enrichment.md` for full details.

---

## Biography Enrichment

Personal life narratives from 37 sources, synthesized by Claude:
1. Structured Data — Wikidata, Wikipedia
2. Reference Sites — Britannica, Biography.com, TCM, AllMusic
3. Books — Google Books, Open Library, IA Books
4. Web Search — Google, Bing, DuckDuckGo, Brave
5. News Sources — Guardian, NYTimes, AP, Reuters, WaPo, LA Times, BBC, NPR, PBS, People, Independent, Telegraph, Time, New Yorker, Rolling Stone, National Geographic, Smithsonian Magazine, History.com
6. Obituary Sites — Legacy.com, Find a Grave
7. Historical Archives — Internet Archive, Chronicling America, Trove, Europeana

Key differences from death enrichment: accumulates ALL raw data, three-stage pipeline, career content filtering, COALESCE upsert.

See `.claude/rules/biography-enrichment.md` for full details.
