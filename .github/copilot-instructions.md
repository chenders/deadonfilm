# Copilot Instructions

Guidance for GitHub Copilot when working with the Dead on Film repository.

**Keep in sync with**: `CLAUDE.md` and `.claude/rules/*.md`. When modifying any of these instruction files, update the others to match. See `.claude/rules/documentation-sync.md` for details.

---

## Critical Rules

### 1. NEVER Commit Directly to Main (MOST IMPORTANT)

**THIS IS THE #1 RULE. ALWAYS create a feature branch BEFORE making any changes, including hotfixes.**

```bash
# BEFORE doing ANYTHING - even reading files to make changes:
git checkout main && git pull
git checkout -b fix/descriptive-name   # or feat/, chore/, docs/

# THEN make changes, commit, push, and create PR
```

**Common mistake**: Starting to make changes while on main, then trying to commit. STOP. Create a branch FIRST.

### 2. NEVER Fabricate Identifiers

Verify before stating any TMDB ID, URL, database value, or API response. If unverified, provide general guidance. Do NOT guess IDs.

### 3. NEVER Use String Interpolation in SQL

```typescript
// WRONG - SQL injection vulnerability
db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// CORRECT - parameterized
db.query(`SELECT * FROM actors WHERE id = $1`, [userId])
```

### 4. NEVER Skip Tests

PRs are NOT ready for review without tests. Never defer tests to follow-up PRs.

### 5. ALWAYS Use dotenv in Scripts

All scripts in `server/scripts/` MUST import `dotenv/config` at the top to load environment variables from `.env` files.

```typescript
#!/usr/bin/env tsx
import "dotenv/config"  // MUST be first import
import { Command } from "commander"
// ... rest of imports
```

---

## Project Overview

**Dead on Film** - A web application that tracks deceased actors across movies and TV shows. Combines TMDB data with AI-powered death enrichment to provide mortality statistics, cause of death details, discovery pages, and an admin dashboard. The database contains 572,000+ actors across 152,000+ movies and TV shows.

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router 6 |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 (raw SQL via `pg`, no ORM) |
| Caching | Redis 7 via `ioredis` |
| Job Queue | BullMQ on separate Redis instance |
| Data Sources | TMDB API, Claude API, Wikidata SPARQL, 50+ enrichment sources |
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
# Development
npm run dev          # Frontend + Backend (starts Docker containers + HMR)
npm run dev:stop     # Stop Docker containers

# Quality checks (run before every commit)
npm run format && cd server && npm run format
npm run lint && cd server && npm run lint
npm run type-check && cd server && npm run type-check
npm test
# Server tests: cd server && npm test

# Build
npm run build        # TypeScript check + Vite production build
npm run build:all    # Frontend + server builds

# Database
cd server && npm run migrate:up      # Run pending migrations
cd server && npm run migrate:down    # Rollback last migration
cd server && npm run migrate:create -- migration-name  # Create new
```

---

## Git Workflow

**NEVER commit directly to `main`** - always use feature branches.

### Branch Workflow

Before starting ANY new work:

```bash
git checkout main && git pull
git checkout -b feat/feature-name   # or fix/, chore/, docs/
```

**When substantial new work is about to begin while already on a feature branch**: Ask if a new branch should be created for the new work (recommended if unrelated) or continue on the current branch (if closely related).

### Commit Format

**ALWAYS use heredoc for multiline commit messages** to prevent bash escaping issues:

```bash
git commit -m "$(cat <<'EOF'
Short summary

Longer description here.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Why heredoc**: Prevents issues with quotes, newlines, and special characters. Always use quoted delimiter (`<<'EOF'`) to prevent variable expansion.

### GitHub CLI Operations

Critical rules for PR comments, screenshots, and reviews:

1. **NEVER commit directly to main** - always use feature branches
2. **ALWAYS use heredoc for multiline commit/PR messages** - prevents bash escaping issues
3. **ALWAYS verify screenshots before committing** - prevents login screen/wrong page uploads
4. **ALWAYS use explicit viewport sizes in Playwright** - ensures consistency across CI/local
5. **ALWAYS use GitHub raw URLs with commit SHA** - prevents broken image links in PRs
6. **ALWAYS use `gh api` for PR inline comments** - native CLI lacks inline comment support
7. **ALWAYS quote heredoc delimiter** (`<<'EOF'` not `<<EOF`) - prevents variable expansion
8. **ALWAYS resolve threads only after implementing fixes** - never resolve declined suggestions
9. **ALWAYS request Copilot re-review after fixes** - use `gh pr edit --add-reviewer Copilot`

For detailed examples, see `.claude/rules/github-cli.md` and `.claude/rules/pr-screenshots.md`.

---

## Testing Requirements

Every PR must include tests covering:

1. **Happy path** - normal operation
2. **Error handling** - database errors, API failures, invalid input
3. **Edge cases** - empty results, pagination boundaries, null values
4. **All branching logic** - every if/else path in new code

### Test Conventions

- Place test files alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import actual production code
- Add `data-testid` to interactive UI elements: `data-testid="kebab-case-name"`

### Query Preference Order

1. `getByRole` - accessibility-first
2. `getByLabelText` - form elements
3. `getByText` - visible text
4. `getByTestId` - last resort

**NEVER use CSS class selectors in tests.**

---

## Mortality Calculations

### Key Formulas

| Formula | Description |
|---------|-------------|
| Expected Deaths | Sum of death probabilities for each actor (filming age to current age) |
| Curse Score (Movies) | `(Actual - Expected) / (Expected + 2)`. Empirical Bayes shrinkage (k=2). Positive = more deaths than expected |
| Curse Score (Actors) | `SUM(Actual) - SUM(Expected)` across filmography. Raw difference, no shrinkage |
| Years Lost | `Expected Lifespan - Actual Lifespan`. Positive = died early |

### Calculation Rules

1. **Archived Footage**: Exclude actors who died >3 years before release
2. **Same-Year Death**: Count with at least 1 year of death probability
3. **Cursed Actors**: Sum co-star deaths across filmography

### Obscure Filtering

A movie is "obscure" if:
- No poster (`poster_path IS NULL`), OR
- English: `popularity < 5.0 AND cast_count < 5`, OR
- Non-English: `popularity < 20.0`

---

## Death Enrichment

The enrichment system tries sources in priority order, stopping when confidence threshold (0.5) is reached:

1. **Phase 1: Structured Data** (free) - Wikidata SPARQL, Wikipedia, IMDb, BFI
2. **Phase 2: Web Search** - Google, Bing, DuckDuckGo, Brave (with link following)
3. **Phase 3: News Sources** - Guardian, NYTimes, AP News, and others
4. **Phase 4: Obituary Sites** - Find a Grave, Legacy.com
5. **Phase 5: Historical Archives** - Trove, Europeana, Internet Archive, Chronicling America
6. **Phase 6: Genealogy** - FamilySearch
7. **Phase 7: AI Models** (optional, by ascending cost) - Gemini Flash through GPT-4o

For full details, see `.claude/rules/death-enrichment.md`.

---

## Biography Enrichment

The biography enrichment system generates personal life narratives (not career profiles) from ~19 data sources, synthesized by Claude:

1. **Phase 1: Structured Data** (free) - Wikidata SPARQL, Wikipedia (AI section selection)
2. **Phase 2: Reference Sites** - Britannica, Biography.com
3. **Phase 3: Web Search** - Google, Bing, DuckDuckGo, Brave (with link following + career filtering)
4. **Phase 4: News Sources** - Guardian, NYTimes, AP News, BBC, People
5. **Phase 5: Obituary Sites** - Legacy.com, Find a Grave
6. **Phase 6: Historical Archives** - Internet Archive, Chronicling America, Trove, Europeana

### Key Differences from Death Enrichment

- **Accumulates ALL raw data** for Claude synthesis (no first-wins merge)
- **Three-stage content pipeline**: mechanical pre-clean → optional Haiku AI extraction → Claude synthesis
- **Career content filtering**: `isCareerHeavyContent()` rejects pages dominated by filmography/awards
- **Early stopping**: After 3+ high-quality sources meeting dual threshold (confidence ≥ 0.6 AND reliability ≥ 0.6)
- **COALESCE upsert**: DB writer preserves existing non-null values on re-enrichment

### Content Focus

Biographies should read like personal narratives: childhood, family, education, struggles, relationships. Career mentioned in 1-2 sentences max. No filmography, awards, or box office numbers.

### Actor Page Features

- **Life section**: `BiographySection` component (`src/components/actor/BiographySection.tsx`) — expandable card showing enriched narrative with gradient truncation, sources
- **Lesser-Known Facts**: Bullet list from `biographyDetails.lesserKnownFacts` — surprising personal details extracted by Claude during synthesis
- **Life/Death factor badges**: `FactorBadge` component (`src/components/death/FactorBadge.tsx`) with `variant` prop — `"life"` (muted teal `bg-life-factor-bg`) for `biographyDetails.lifeNotableFactors`, `"death"` (reddish `bg-deceased-bg`) for `deathInfo.notableFactors`
- **Valid life tags**: Controlled vocabulary in `VALID_LIFE_NOTABLE_FACTORS` (`server/src/lib/biography-sources/types.ts`) — orphaned, adopted, military_service, dropout, rags_to_riches, polyglot, philanthropist, etc. (36 tags)

For full details, see `.claude/rules/biography-enrichment.md`.

---

## Code Quality

- **DRY**: Extract repeated logic, consolidate identical branches
- Run format/lint/type-check before committing
- **Magic numbers**: Extract to named constants at module level
- **N+1 queries**: Batch database lookups, never query inside loops
- **Unused variables**: Remove before committing
- **Naming consistency**: When renaming functions/APIs, update all variable names, comments, doc blocks, and error messages that reference the old name

---

## Security Best Practices

### HTML Sanitization

Simple regex `/<[^>]+>/g` is insufficient for standalone use. Use the `htmlToText()` function from `server/src/lib/death-sources/html-utils.ts` which provides complete sanitization:

1. Removes script/style tags via state machines
2. Strips remaining HTML tags
3. Decodes HTML entities
4. Normalizes whitespace

### HTML Entity Decoding

Use the `he` library - never write custom entity decoding:

```typescript
import he from "he"
he.decode("&lt;script&gt;") // "<script>"
he.escape("<script>")       // "&lt;script&gt;"
```

Use `decodeHtmlEntities()` from `server/src/lib/death-sources/html-utils.ts`

### Regex Safety

Escape user input in RegExp:

```typescript
function escapeRegex(str: string): string {
  return str.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&")
}
```

### Cross-Platform Paths

Use `fileURLToPath` instead of `new URL().pathname`:

```typescript
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
```

---

## JavaScript/CommonJS Files

These must remain JS/CJS for tooling compatibility: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `server/migrations/*.cjs`, `server/newrelic.cjs`

---

## PR Review Responses

When reviewers suggest adding tests:

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests for [component]." | "Out of scope" |
| "Test already exists in [file]." | "Will address in follow-up" |
