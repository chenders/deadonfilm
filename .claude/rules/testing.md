---
globs: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"]
---
# Testing Standards

## What to Test

Every PR must include tests covering:

1. **Happy path** - normal operation
2. **Error handling** - database errors, API failures, invalid input
3. **Edge cases** - empty results, pagination boundaries, null values
4. **All branching logic** - every if/else path in new code

## Test File Conventions

- Place test files alongside code: `*.test.ts` or `*.test.tsx`
- Tests MUST import actual production code, not reimplementations
- Add `data-testid` to interactive UI elements: `data-testid="kebab-case-name"`

## Query Preference Order

1. `getByRole` - accessibility-first
2. `getByLabelText` - form elements
3. `getByText` - visible text
4. `getByTestId` - last resort

**NEVER use CSS class selectors in tests.**

## Test All Conditional UI States

When UI changes based on state/props, test EACH condition:

```typescript
// WRONG: Only tests default state
it("renders description", () => {
  expect(screen.getByText(/some description/)).toBeInTheDocument()
})

// CORRECT: Tests both states
it("shows filtered description when unchecked", () => {
  expect(screen.getByText(/without optional/)).toBeInTheDocument()
  expect(screen.queryByText(/optional/)).not.toBeInTheDocument()
})

it("shows full description when checked", () => {
  fireEvent.click(screen.getByRole("checkbox"))
  expect(screen.getByText(/with optional/)).toBeInTheDocument()
})
```

## Playwright Visual Snapshots

**ALWAYS use Docker** for visual regression snapshots (CI runs Linux):

```bash
docker run --rm -v /path/to/project:/app -w /app --ipc=host \
  mcr.microsoft.com/playwright:v1.57.0-noble \
  sh -c "npm ci && npx playwright test --update-snapshots --grep 'test name'"
```

| Rule | Requirement |
|------|-------------|
| Commit | Only `*-linux.png` snapshots |
| Never commit | macOS/darwin snapshots |
| Docker version | MUST match Playwright version in package.json |

## Responding to Review Comments

When reviewers suggest adding tests:

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests for [component]." | "Out of scope" / "Will address later" |
