# Copilot Instructions

Focused guidance for GitHub Copilot code review on the Dead on Film repository.

**Full reference**: `.github/docs/copilot-reference.md` | **Sync with**: `CLAUDE.md`, `.claude/rules/*.md`

---

## Critical Rules

1. **NEVER commit directly to main** — always use feature branches
2. **NEVER fabricate identifiers** — verify TMDB IDs, URLs, database values before stating them
3. **NEVER use string interpolation in SQL** — always use parameterized queries (`$1`, `$2`)
4. **NEVER skip tests** — PRs are not ready without tests; never defer to follow-up PRs
5. **ALWAYS import `dotenv/config` first** in `server/scripts/*.ts`

---

## Null Safety / Row Access

**ALWAYS guard `rows[0]`** — Copilot flags every unguarded instance:

```typescript
// Aggregate queries (always return a row, but guard anyway):
const count = parseInt(result.rows[0]?.count ?? "0", 10)

// Lookup queries (may return no rows):
const actor = result.rows[0]
if (!actor) {
  return res.status(404).json({ error: "Actor not found" })
}

// Stats queries (destructure with fallback):
const stats = result.rows[0]
const total = parseInt(stats?.total ?? "0", 10)
```

---

## Testing Requirements

- **Ship tests with code** — in the same commit, never deferred
- **Assert deeply** — verify payload shape and values, not just that functions were called
- **Mock data must match real SQL types** — if SQL casts to string, mock with strings
- **Test all paths**: happy path, error handling, edge cases, branching logic
- **Query order**: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- **NEVER use CSS class selectors** in tests
- **When modifying an untested file**, create a test file with at least happy-path and error tests

---

## Type Safety

- **No `any`** — use `unknown` and narrow with type guards
- **JSON columns**: `pg` auto-parses — type as parsed type (`MyType[]`), not `string`
- **Optional vs required**: only use `?` when endpoints genuinely omit the field

---

## Function Length

Route handlers and library functions should stay under 60 lines. Decompose:
- **Database queries** → `server/src/lib/db/{entity}.ts`
- **Response shaping** → helper function in same file
- **Validation** → middleware or guard clauses at top
- **Complex conditionals** → named helper functions

---

## Code Quality

- **DRY**: extract repeated logic before duplicating across desktop/mobile views
- **Null safety**: guard `rows[0]`, guard config spreads (`...(config?.field ?? {})`)
- **Naming consistency**: when renaming functions, update all variables, comments, error messages
- **Accessibility**: icon-only buttons need `aria-label`, minimum 44x44px touch targets
- **AbortSignal**: combine signals with `AbortSignal.any()`, never `??` which defeats timeout
- **No magic numbers**: extract to named constants
- **No N+1 queries**: batch lookups, never query inside loops
- **Unused variables**: remove before committing
- **Early returns** over deep nesting — guard clauses at top of function
- **Error handling**: never swallow errors silently — always log with pino

---

## Security

- **SQL**: always parameterized queries (`$1`, `$2`), never string interpolation
- **HTML sanitization**: use `htmlToText()` from `server/src/lib/death-sources/html-utils.ts`
- **HTML entities**: use the `he` library, never custom decoding
- **Regex**: escape user input with `str.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&")`
- **File paths**: use `fileURLToPath(import.meta.url)`, not `new URL().pathname`

---

## JS/CJS Files

Must remain JS/CJS: `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `server/migrations/*.cjs`, `server/newrelic.cjs`
