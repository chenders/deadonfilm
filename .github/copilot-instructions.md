# Copilot Instructions

Guidance for GitHub Copilot when working with the Dead on Film repository.

**Keep in sync with**: `CLAUDE.md` and `.claude/rules/*.md`

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

**Why this matters**: Direct commits to main bypass CI, skip code review, and can break production. The deployment failure from migration ordering is an example of what happens when branches aren't properly managed.

### 2. NEVER Fabricate Identifiers

Verify before stating any TMDB ID, URL, database value, or API response. If unverified, provide general guidance. Do NOT guess IDs.

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

### 5. ALWAYS Use dotenv in Scripts

All scripts in `server/scripts/` MUST import `dotenv/config` at the top to load environment variables from `.env` files.

```typescript
#!/usr/bin/env tsx
import "dotenv/config"  // MUST be first import
import { Command } from "commander"
// ... rest of imports

// Script can now access process.env.DATABASE_URL, etc.
```

**Why:** Scripts run outside the server context and won't have access to environment variables (DATABASE_URL, API keys, etc.) without explicitly loading dotenv.

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
| Actor | `/actor/{slug}-{actorId}` (uses internal `actor.id`) |
| Movie | `/movie/{slug}-{year}-{tmdbId}` |
| Show | `/show/{slug}-{firstAirYear}-{tmdbId}` |
| Episode | `/episode/{showSlug}-s{season}e{episode}-{episodeSlug}-{showTmdbId}` |

**Note**: Actor URLs use the internal `actor.id` (not `tmdb_id`) to avoid ID overlap issues. Legacy URLs with `tmdb_id` are automatically redirected via 301.

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
npm test
# Server tests: cd server && npm test (may exit non-zero locally; CI runs reliably)

# Development
npm run dev:all      # Frontend + Backend
npm run start:dev    # Hybrid mode (Docker infra + native code)
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

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Why heredoc**: Prevents issues with quotes, newlines, and special characters. Always use quoted delimiter (`<<'EOF'`) to prevent variable expansion.

### GitHub CLI Operations

Critical rules for PR comments, screenshots, and reviews:

1. **NEVER commit directly to main** - always use feature branches, ask about new branches for substantial new work
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

## PR Review Responses

When reviewers suggest adding tests:

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests for [component]." | "Out of scope" |
| "Test already exists in [file]." | "Will address in follow-up" |
