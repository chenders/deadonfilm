# CLAUDE.md

Guidance for Claude Code when working with the Dead on Film repository.

## CRITICAL RULES

<critical_constraints>

### 1. NEVER Fabricate Identifiers

Verify before stating any TMDB ID, URL, database value, or API response. If unverified, say "I don't know" or provide general guidance. Do NOT guess IDs - this causes real bugs.

### 2. NEVER Use String Interpolation in SQL

```typescript
// WRONG - SQL injection
db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// CORRECT - parameterized
db.query(`SELECT * FROM actors WHERE id = $1`, [userId])

// Optional filters - use boolean logic, not string interpolation
// AND ($1 = true OR status = 'active')
```

### 3. NEVER Skip Tests

PRs are NOT ready for review without tests for all new/changed code. Never defer tests to follow-up PRs.

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
| Movie | `/movie/{slug}-{year}-{tmdbId}` |
| Show | `/show/{slug}-{firstAirYear}-{tmdbId}` |
| Episode | `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}` |

## Database Schema

| Table | Purpose |
|-------|---------|
| `actors` | All actors, death info, popularity. `tmdb_id` is nullable. |
| `movies` / `shows` / `episodes` | Content metadata with mortality stats |
| `actor_movie_appearances` / `actor_show_appearances` | Links actors to content (use `actor_id`, not `tmdb_id`) |
| `actuarial_life_tables` / `cohort_life_expectancy` | SSA mortality data |

## Development Workflow

### Before Every Commit

```bash
npm run format && cd server && npm run format
npm run lint && cd server && npm run lint
npm run type-check && cd server && npm run type-check
npm test && cd server && npm test
```

### Git Workflow

**NEVER commit directly to `main`** - use pull requests.

```bash
git checkout -b feat/feature-name   # features
git checkout -b fix/bug-name        # fixes
git checkout -b chore/task-name     # maintenance
```

Commit format:

```bash
git commit -m "Short summary

Longer description here.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

After implementing a plan, delete the plan file from `~/.claude/plans/`.

## Code Quality

- **DRY**: Extract repeated logic, consolidate identical branches
- **QuickActions.tsx**: Use shared `emojiClass` variable for emoji spans
- **Background commands**: Chain properly: `cmd 2>&1 & sleep 3 && next-cmd`
