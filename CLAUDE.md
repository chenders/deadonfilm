# CLAUDE.md

Guidance for Claude Code when working with the Dead on Film repository.

## Critical Rules

<critical_constraints>

### 1. NEVER Commit Directly to Main (MOST IMPORTANT)

**THIS IS THE #1 RULE. ALWAYS create a feature branch BEFORE making any changes, including hotfixes.**

```bash
# BEFORE doing ANYTHING - even reading files to make changes:
git checkout main && git pull
git checkout -b fix/descriptive-name   # or feat/, chore/, docs/

# THEN make changes, commit, push, and create PR
```

**Common mistake**: Starting to make changes while on main, then trying to commit. STOP. Create a branch FIRST.

**Why this matters**: Direct commits to main bypass CI, skip code review, and can break production. The deployment failure from migration ordering is an example of what happens when branches aren't properly managed.

### 2. NEVER Fabricate Identifiers

Verify before stating any TMDB ID, URL, database value, or API response. If unverified, say "I don't know" or provide general guidance. Do NOT guess IDs.

### 3. NEVER Use String Interpolation in SQL

```typescript
// WRONG - SQL injection vulnerability
db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// CORRECT - parameterized
db.query(`SELECT * FROM actors WHERE id = $1`, [userId])

// Optional filters - use boolean logic, not string interpolation
// AND ($1 = true OR status = 'active')
```

### 4. NEVER Skip Tests

PRs are NOT ready for review without tests. Never defer tests to follow-up PRs.

### 5. NEVER Manually Set Migration Timestamps

Always use `npm run migrate:create` to generate unique timestamps. Duplicate timestamps cause production deployment failures.

```bash
# CORRECT - generates unique timestamp
cd server && npm run migrate:create -- add-new-table

# WRONG - never manually create files like:
# 1767900000000_my-migration.cjs  (hardcoded timestamp may conflict)
```

### 6. Use `docker compose` Not `docker-compose`

Always use the modern `docker compose` command (Docker Compose V2), not the legacy `docker-compose`.

```bash
# CORRECT
docker compose up -d
docker compose build --no-cache

# WRONG - legacy standalone binary
docker-compose up -d
```

### 7. ALWAYS Use dotenv in Scripts

All scripts in `server/scripts/` MUST import `dotenv/config` at the top to load environment variables from `.env` files.

```typescript
#!/usr/bin/env tsx
import "dotenv/config"  // MUST be first import
import { Command } from "commander"
// ... rest of imports

// Script can now access process.env.DATABASE_URL, etc.
```

**Why:** Scripts run outside the server context and won't have access to environment variables (DATABASE_URL, API keys, etc.) without explicitly loading dotenv.

### 8. ALWAYS Run Tests Before Pushing

The pre-push hook automatically runs type-check and tests (frontend + server in parallel) before each push. It will block pushes if anything fails.

```bash
# The pre-push hook runs automatically, but to run manually:
npm run type-check && cd server && npm run type-check
npm test && cd server && npm test

# If tests fail, fix them before pushing
# NEVER push with failing tests - CI will fail and block the PR
```

**Note:** Server integration tests (BullMQ/Redis) auto-skip locally when `REDIS_JOBS_URL` and `DATABASE_URL` are not set. CI runs the full suite.

**Why:** GitHub Actions CI runs all tests. Pushing with failing tests wastes CI resources and blocks PR merges. Pre-push hooks catch this locally.

</critical_constraints>

## Project Overview

**Dead on Film** - Look up movies/TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL 16 |
| State | TanStack Query |
| Data Sources | TMDB API, Claude API, Wikidata SPARQL |

### URL Patterns

| Type | Pattern |
|------|---------|
| Actor | `/actor/{slug}-{actorId}` (uses internal `actor.id`) |
| Movie | `/movie/{slug}-{year}-{tmdbId}` |
| Show | `/show/{slug}-{firstAirYear}-{tmdbId}` |
| Episode | `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}` |

**Note**: Actor URLs use the internal `actor.id` (not `tmdb_id`) to avoid ID overlap issues. Legacy URLs with `tmdb_id` are automatically redirected via 301.

## Database Schema

| Table | Purpose |
|-------|---------|
| `actors` | All actors, death info, popularity. `tmdb_id` is **nullable**. |
| `movies` / `shows` / `episodes` | Content metadata with mortality stats |
| `actor_movie_appearances` / `actor_show_appearances` | Links actors to content via `actor_id` (primary key) |
| `actuarial_life_tables` / `cohort_life_expectancy` | SSA mortality data |

**Important**: Always join actors using `actor_id`, never `tmdb_id`. The `tmdb_id` field can be NULL for actors from non-TMDB sources.

## Development Workflow

### Before Every Commit

Git hooks enforce quality automatically:
- **Pre-commit** (`lint-staged`): format + lint on staged files only (<5s)
- **Pre-push** (parallel): type-check + tests for frontend and server (~20-30s)

To run checks manually:

```bash
npm run type-check && cd server && npm run type-check
npm test && cd server && npm test
```

**Note:** Server integration tests (Redis/Postgres-dependent) auto-skip locally when Docker containers aren't running. CI runs them with full infrastructure.

### Git Workflow

**NEVER commit directly to `main`** - always use feature branches (see Critical Rule #1).

#### Branch Workflow

Before starting ANY new work:

```bash
git checkout main && git pull
git checkout -b feat/feature-name   # or fix/, chore/, docs/
```

**When substantial new work is about to begin while already on a feature branch**: Ask the user if they want to create a new branch for the new work (recommended if unrelated) or continue on the current branch (if closely related).

See `.claude/rules/github-cli.md` for complete branch workflow guidance.

#### Commit Format

**ALWAYS use heredoc for multiline commit messages** to prevent bash escaping issues:

```bash
git commit -m "$(cat <<'EOF'
Short summary

Longer description here.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Why heredoc**: Prevents issues with quotes, newlines, and special characters. Always use quoted delimiter (`<<'EOF'`) to prevent variable expansion.

#### GitHub CLI Operations

Critical rules for PR comments, screenshots, and Copilot reviews:

1. **NEVER commit directly to main** - always use feature branches, ask about new branches for substantial new work
2. **ALWAYS use heredoc for multiline commit/PR messages** - prevents bash escaping issues
3. **ALWAYS verify screenshots before committing** - prevents login screen/wrong page uploads
4. **ALWAYS use explicit viewport sizes in Playwright** - ensures consistency across CI/local
5. **ALWAYS use GitHub raw URLs with commit SHA** - prevents broken image links in PRs
6. **ALWAYS use `gh api` for PR inline comments** - native CLI lacks inline comment support
7. **ALWAYS quote heredoc delimiter** (`<<'EOF'` not `<<EOF`) - prevents variable expansion
8. **ALWAYS resolve threads only after implementing fixes** - never resolve declined suggestions
9. **ALWAYS request Copilot re-review after fixes** - use `gh pr edit --add-reviewer Copilot`

See `.claude/rules/github-cli.md` for complete examples and workflows.

## Code Quality

- **DRY**: Extract repeated logic, consolidate identical branches
- **QuickActions.tsx**: Use shared `emojiClass` variable for emoji spans
- **Background commands**: Chain properly: `cmd 2>&1 & sleep 3 && next-cmd`
- **Magic numbers**: Extract to named constants at module level

```typescript
// BAD
if (text.length > 200) { ... }

// GOOD
const MIN_CIRCUMSTANCES_LENGTH = 200
if (text.length > MIN_CIRCUMSTANCES_LENGTH) { ... }
```

- **N+1 queries**: Batch database lookups, never query inside loops

```typescript
// BAD - N+1 queries
for (const actor of actors) {
  const details = await getActorDetails(actor.id)
}

// GOOD - batch fetch
const actorIds = actors.map(a => a.id)
const detailsMap = await batchGetActorDetails(actorIds)
```

## Caching

Redis caching uses centralized key management in `server/src/lib/cache.ts`.

### Cache Key Registry

All cache keys are defined in `CACHE_KEYS`:

```typescript
import { CACHE_KEYS, getActorCacheKeys } from "../lib/cache.js"

// Get all keys for an actor
const keys = CACHE_KEYS.actor(2157)
// { profile: "actor:id:2157", death: "actor:id:2157:type:death" }

// Or as an array
const keyList = getActorCacheKeys(2157)
// ["actor:id:2157", "actor:id:2157:type:death"]
```

### Invalidation Patterns

**In routes** (Redis optional - graceful degradation):
```typescript
await invalidateActorCache(tmdbId)  // Returns silently if Redis unavailable
```

**In scripts** (Redis required - must succeed):
```typescript
await invalidateActorCacheRequired(tmdbId)  // Throws if Redis unavailable
```

### Rules

1. **Never hardcode cache keys** - always use `CACHE_KEYS` or `buildCacheKey`
2. **Add new entity keys to `CACHE_KEYS`** when adding cached entities
3. **Use `*Required` variants in scripts** that must invalidate cache
4. **Test cache hit/miss paths** - see testing.md

## Logging

Use structured logging with Pino for all server-side code. Logs are sent to stdout (New Relic) and optionally to file (`/var/log/deadonfilm/app.log`).

### Rules

1. **Prefer the structured logger over `console.log/error/warn` in routes and libs.**
   - Application routes and libraries should call the shared logger helpers, not `console.*`.
   - **Exceptions:** logger/bootstrap code (e.g. `server/src/lib/logger.ts`, `log-persistence.ts`) may use `console.*` as a last-resort fallback when the logger cannot be initialized or is failing.
2. **Scripts may use `console.log`** for user-facing CLI output (progress, summaries)
3. **Always add context** - include relevant IDs and state in log objects

### Context Helpers

```typescript
import { createRouteLogger, createScriptLogger, createJobLogger, createStartupLogger } from "../lib/logger.js"

// In routes - includes requestId, path, method
const log = createRouteLogger(req)
log.error({ actorId, error }, "Failed to fetch actor")

// In scripts
const log = createScriptLogger("sync-tmdb-changes")
log.info({ processed: 100, failed: 2 }, "Sync complete")

// In background jobs
const log = createJobLogger("enrich-death-details", runId)
log.warn({ actorId }, "No death info found")

// In server startup
const log = createStartupLogger()
log.info({ port: 8080 }, "Server started")
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `fatal` | System is unusable, process should exit |
| `error` | Error conditions (persisted to database) |
| `warn` | Warning conditions, potential issues |
| `info` | Normal informational messages |
| `debug` | Debug-level details (dev only) |
| `trace` | Most detailed tracing |

### Error Logging Pattern

```typescript
// GOOD - structured error with context
log.error({ error, actorId, path: req.path }, "Actor lookup failed")

// BAD - unstructured string interpolation
console.error(`Actor lookup failed for ${actorId}: ${error}`)
```

## Data Source Implementation

When implementing a new death information data source:

1. **Add source type** to `server/src/lib/death-sources/types.ts` enum
2. **Create implementation** in `server/src/lib/death-sources/sources/`
3. **Add tests** with mocked fetch responses
4. **Export from** `server/src/lib/death-sources/index.ts`
5. **Register in orchestrator** at `server/src/lib/death-sources/orchestrator.ts`
6. **Document in `.env.example`** if API key required:
   - How to get the API key (signup URL)
   - Cost per query (or "free")
   - Any rate limits or restrictions
   - Quality estimate (e.g., "High quality - authoritative industry source")

Example `.env.example` entry:
```bash
# NewsAPI - News aggregator (80,000+ sources)
# Quality: High for recent deaths (aggregates major news outlets)
# Free tier: 100 requests/day (450 in development)
# Get yours at https://newsapi.org/register
# NEWSAPI_KEY=
```
