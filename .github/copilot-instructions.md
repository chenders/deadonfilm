# Copilot Instructions

Guidance for GitHub Copilot when working with the Dead on Film repository.

**Keep in sync with**: `CLAUDE.md` and `.claude/rules/*.md`

---

## Critical Rules

### 1. NEVER Fabricate Identifiers

Verify before stating any TMDB ID, URL, database value, or API response. If unverified, provide general guidance. Do NOT guess IDs.

### 2. NEVER Use String Interpolation in SQL

```typescript
// WRONG - SQL injection vulnerability
db.query(`SELECT * FROM actors WHERE id = ${userId}`)

// CORRECT - parameterized
db.query(`SELECT * FROM actors WHERE id = $1`, [userId])

// Optional filters - use boolean logic, not string interpolation
// AND ($1 = true OR status = 'active')
```

### 3. NEVER Skip Tests

PRs are NOT ready for review without tests. Never defer tests to follow-up PRs.

### 4. NEVER Commit Directly to Main

Always create a feature branch for new work. Push to the branch and create a PR.

```bash
git checkout main && git pull
git checkout -b feat/feature-name   # or fix/, chore/
```

---

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

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `actors` | All actors, death info, popularity. **`tmdb_id` is nullable.** |
| `movies` / `shows` / `episodes` | Content metadata with mortality stats |
| `actor_movie_appearances` / `actor_show_appearances` | Links actors to content via `actor_id` (primary key) |
| `actuarial_life_tables` / `cohort_life_expectancy` | SSA mortality data |

**Important**: Always join actors using `actor_id`, never `tmdb_id`. The `tmdb_id` field can be NULL for actors from non-TMDB sources.

---

## Development Commands

```bash
# Quality checks (run before every commit)
npm run format && cd server && npm run format
npm run lint && cd server && npm run lint
npm run type-check && cd server && npm run type-check
npm test && cd server && npm test

# Development
npm run dev:all      # Frontend + Backend
npm run start:dev    # Hybrid mode (Docker infra + native code)
```

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
| Curse Score | `(Actual - Expected) / Expected`. Positive = more deaths than expected |
| Years Lost | `Expected Lifespan - Actual Lifespan`. Positive = died early |

### Calculation Rules

1. **Archived Footage**: Exclude actors who died >3 years before release
2. **Same-Year Death**: Count with at least 1 year of death probability
3. **Cursed Actors**: Sum co-star deaths across filmography, then compute curse score

### Obscure Filtering

A movie is "obscure" if:
- No poster (`poster_path IS NULL`), OR
- English: `popularity < 5.0 AND cast_count < 5`, OR
- Non-English: `popularity < 20.0`

---

## Cause of Death Lookup Priority

1. **Claude API** - ALWAYS try first (most accurate)
2. **Wikidata SPARQL** - Only if Claude returns null/vague
3. **Wikipedia text** - Last resort

---

## Code Quality

- **DRY**: Extract repeated logic, consolidate identical branches
- **QuickActions.tsx**: Use shared `emojiClass` variable for emoji spans
- Run format/lint/type-check before committing
- **Magic numbers**: Extract to named constants at module level
- **N+1 queries**: Batch database lookups, never query inside loops
- **Unused variables**: Remove before committing

---

## Security Best Practices

### HTML Sanitization

Simple regex `/<[^>]+>/g` is insufficient. Use iterative removal:

```typescript
function stripHtmlTags(html: string): string {
  let result = html
  let previousLength: number
  do {
    previousLength = result.length
    result = result.replace(/<[^>]*>/g, "")
  } while (result.length < previousLength)
  return result.replace(/[<>]/g, "")  // Remove remaining brackets
}
```

### HTML Entity Decoding

Decode `&amp;` LAST to avoid double-unescaping:

```typescript
text.replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")  // MUST be last
```

### Regex Safety

Escape user input in RegExp:

```typescript
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")
}
```

### Cross-Platform Paths

Use `fileURLToPath` instead of `new URL().pathname`:

```typescript
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
```

---

## PR Review Responses

When reviewers suggest adding tests:

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests for [component]." | "Out of scope" |
| "Test already exists in [file]." | "Will address in follow-up" |
