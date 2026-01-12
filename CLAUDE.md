# CLAUDE.md

This file provides guidance to Claude Code when working with the Dead on Film repository.

---

## CRITICAL RULES - Read First

<critical_constraints>

### 1. NEVER Fabricate Identifiers

**You MUST verify before stating any specific identifier, ID, or URL.**

- TMDB IDs, URLs containing IDs, database record values, API responses - look them up first
- If you haven't used a tool to verify, either say "I don't know" or provide general guidance
- Do NOT fill in plausible-looking numbers or IDs - this causes real bugs

### 2. NEVER Use String Interpolation in SQL

**All database queries MUST use parameterized queries to prevent SQL injection.**

```typescript
// WRONG - SQL injection vulnerability
const result = await db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// CORRECT - parameterized query
const result = await db.query(`SELECT * FROM actors WHERE id = $1`, [userId])

// For optional filters, use boolean logic:
// WRONG: ${includeAll ? "" : "AND status = 'active'"}
// CORRECT: AND ($1 = true OR status = 'active')
```

### 3. NEVER Skip Tests

**A PR is NOT ready for review until it includes tests for all new/changed code.**

- Test coverage is NEVER "out of scope" - include tests in the same PR
- NEVER defer tests to a follow-up PR
- NEVER dismiss automated reviewer suggestions to add tests

</critical_constraints>

---

## Project Overview

**Dead on Film** - A website to look up movies and TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express.js + TypeScript |
| Database | PostgreSQL 16 (containerized) |
| State | TanStack Query |
| Deployment | Docker on bare-metal with Cloudflare Tunnel |
| Data Sources | TMDB API, Claude API (cause of death), Wikidata SPARQL (fallback) |

### URL Structure

| Type | Pattern | Example |
|------|---------|---------|
| Movie | `/movie/{slug}-{year}-{tmdbId}` | `/movie/breakfast-at-tiffanys-1961-14629` |
| Show | `/show/{slug}-{firstAirYear}-{tmdbId}` | `/show/seinfeld-1989-1400` |
| Episode | `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}` | - |

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `actors` | All actors (living/deceased), death info, popularity |
| `movies` | Movie metadata, mortality statistics, `is_obscure` flag |
| `shows` | TV show metadata with mortality statistics |
| `seasons` | Season metadata for TV shows |
| `episodes` | Episode metadata with per-episode mortality stats |
| `actor_movie_appearances` | Links actors to movies |
| `actor_show_appearances` | Links actors to TV show episodes |
| `actuarial_life_tables` | SSA period life tables for death probability |
| `cohort_life_expectancy` | SSA cohort life expectancy by birth year |
| `sync_state` | Tracks TMDB sync progress |

### Actor Schema - Important Notes

The `actors` table supports multiple data sources:

- `tmdb_id` is **nullable** - actors can exist without a TMDB profile
- External ID columns: `imdb_person_id`, `tvmaze_person_id`, `thetvdb_person_id`
- **IMPORTANT**: Appearance tables reference `actor_id` (primary key), NOT `tmdb_id`

---

## Development Workflow

### Before Every Commit

Run these commands and fix any issues before committing:

```bash
# Format code
npm run format && cd server && npm run format

# Check for lint errors
npm run lint && cd server && npm run lint

# Verify types
npm run type-check && cd server && npm run type-check

# Run tests
npm test && cd server && npm test
```

### Git Workflow

**NEVER commit directly to `main`** - all work goes through pull requests.

```bash
git checkout -b feat/feature-name   # New features
git checkout -b fix/bug-name        # Bug fixes
git checkout -b chore/task-name     # Maintenance
```

Commit message format (use double-quoted strings, not heredocs):

```bash
git commit -m "Short summary

Longer description here.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

After implementing a plan, delete the plan file from `~/.claude/plans/`.

---

## Testing Requirements

### What to Test

Every PR must include tests covering:

1. **Happy path** - normal operation
2. **Error handling** - database errors, API failures, invalid input
3. **Edge cases** - empty results, pagination boundaries, null values
4. **All branching logic** - every if/else path in new code

### Test File Conventions

- Place test files alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import actual production code, not reimplementations
- Add `data-testid` to interactive UI elements using kebab-case: `data-testid="death-details-trigger"`

### Query Preference Order

When selecting elements in tests, prefer (in order):
1. `getByRole` - accessibility-first
2. `getByLabelText` - form elements
3. `getByText` - visible text
4. `getByTestId` - last resort

**NEVER use CSS class selectors in tests.**

### Responding to Review Comments

When automated reviewers suggest adding tests:

| Acceptable Response | Unacceptable Response |
|---------------------|----------------------|
| "Fixed in [commit]. Added tests for [component]." | "Out of scope" |
| | "Will address in a follow-up" |

---

## Code Quality Standards

### DRY Principle

- Extract repeated logic into functions
- Consolidate identical conditional branches
- Avoid code duplication

### UI Component Patterns

When adding buttons to `src/components/search/QuickActions.tsx`:

```tsx
// CORRECT - use the shared emojiClass variable
<span className={emojiClass}>⏳</span>

// WRONG - causes inconsistent button heights
<span className="text-sm">⏳</span>
```

The test suite verifies emoji span consistency to prevent regressions.

---

## Shell Commands

When running background commands with `&`, chain subsequent commands properly:

```bash
# Correct
npm run dev:all 2>&1 & sleep 3 && curl http://localhost:8080/health
```