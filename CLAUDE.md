# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Verify Before Providing Details

**Never fabricate specific identifiers, IDs, or URLs.** If you haven't looked something up using a tool, don't provide it as if it's a fact.

- TMDB IDs, URLs containing IDs, database record values, API responses - verify before stating
- Either look it up first, tell the user you don't know, or provide general guidance without the specific value
- Do NOT fill in plausible-looking numbers or IDs

## SQL Security - Always Use Parameterized Queries

**NEVER use string interpolation or template literals to build SQL queries with dynamic values.**

```typescript
// BAD - creates SQL injection vulnerability
const result = await db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// GOOD - use parameterized queries
const result = await db.query(`SELECT * FROM actors WHERE id = $1`, [userId])

// For optional filters, use boolean logic instead of string interpolation:
// Instead of: ${includeAll ? "" : "AND status = 'active'"}
// Use: AND ($1 = true OR status = 'active')
```

## Project Overview

**Dead on Film** - A website to look up movies and TV shows to see which actors have passed away. Shows mortality statistics, death dates, and causes of death. Supports both movies and TV shows.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL 16 (containerized)
- **State Management**: TanStack Query
- **Deployment**: Docker on bare-metal with Cloudflare Tunnel
- **Data Sources**: TMDB API, Claude API (cause of death), Wikidata SPARQL (fallback)

## Database Tables

| Table | Purpose |
|-------|---------|
| `actors` | All actors (living and deceased), death info, popularity |
| `movies` | Movie metadata, mortality statistics, is_obscure flag |
| `shows` | TV show metadata with mortality statistics |
| `seasons` | Season metadata for TV shows |
| `episodes` | Episode metadata with per-episode mortality stats |
| `actor_movie_appearances` | Junction table linking actors to movies |
| `actor_show_appearances` | Junction table linking actors to TV show episodes |
| `actuarial_life_tables` | SSA period life tables for death probability |
| `cohort_life_expectancy` | SSA cohort life expectancy by birth year |
| `sync_state` | Tracks TMDB sync progress |

### Actor Schema Notes

The `actors` table supports multiple data sources:
- `tmdb_id` is **nullable** - actors can exist without a TMDB profile
- `imdb_person_id`, `tvmaze_person_id`, `thetvdb_person_id` columns exist for external IDs
- Appearance tables (`actor_movie_appearances`, `actor_show_appearances`) reference actors by `actor_id` (the primary key), NOT by `tmdb_id`

## UI Component Patterns

### QuickActions Buttons

When adding new buttons to `src/components/search/QuickActions.tsx`:
- **Always use the shared `emojiClass` variable** for emoji spans (provides `text-base leading-none`)
- Do NOT use custom classes like `text-sm` for emojis - this causes inconsistent button heights
- The test suite verifies all emoji spans use consistent classes to prevent regressions

```tsx
// CORRECT - use the shared emojiClass
<span className={emojiClass}>⏳</span>

// WRONG - causes height inconsistency
<span className="text-sm">⏳</span>
```

## URL Structure

- Movies: `/movie/{slug}-{year}-{tmdbId}` (e.g., `/movie/breakfast-at-tiffanys-1961-14629`)
- Shows: `/show/{slug}-{firstAirYear}-{tmdbId}` (e.g., `/show/seinfeld-1989-1400`)
- Episodes: `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}`

## Development Standards

### Code Quality
- Run `npm run format && cd server && npm run format` before committing
- Run `npm run lint && cd server && npm run lint` to check for errors
- Run `npm run type-check && cd server && npm run type-check` for type safety

### DRY Principle
- Avoid code duplication - extract repeated logic into functions
- Consolidate identical conditional branches

### Pre-Commit Checklist
1. `npm run format && cd server && npm run format`
2. `npm run lint && cd server && npm run lint`
3. `npm run type-check && cd server && npm run type-check`
4. `npm test && cd server && npm test`

## Testing Requirements

**A PR is NOT ready for review until it includes tests for all new/changed code.**

- Write unit tests for new functionality - this is a hard requirement
- Test files go alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import and test actual production code, not reimplementations
- **Test coverage is NEVER out of scope** - include tests in the same PR

### Test Coverage Requirements
- Happy path (normal operation)
- Error handling (database errors, API failures, invalid input)
- Edge cases (empty results, pagination boundaries, null values)
- All branching logic in the new code

### data-testid Conventions
- Add `data-testid` to interactive/testable UI elements
- Use descriptive kebab-case names: `data-testid="death-details-trigger"`
- Query preference order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- **Never use CSS class selectors** in tests

## Responding to Review Comments

When GitHub Copilot or other automated reviewers suggest adding tests:

1. **NEVER dismiss test suggestions as "out of scope"**
2. **NEVER defer test coverage to a follow-up PR**
3. **Implement the requested tests** before responding

Acceptable: "Fixed in [commit]. Added tests for [component]."
Unacceptable: "Out of scope", "Will address in a follow-up"

## Git

### Branching Strategy
**Never commit directly to `main`** - all work goes through pull requests.

```bash
git checkout -b feat/feature-name   # New features
git checkout -b fix/bug-name        # Bug fixes
git checkout -b chore/task-name     # Maintenance
```

### Commit Messages
Use simple double-quoted strings. Do NOT use heredocs inside command substitution.

```bash
git commit -m "Short summary

Longer description here.

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Plan Files
After implementing a plan, delete the plan file from `~/.claude/plans/`.

## Shell Commands

When running background commands with `&`, chain subsequent commands properly:
```bash
# Correct
npm run dev:all 2>&1 & sleep 3 && curl http://localhost:8080/health
```
