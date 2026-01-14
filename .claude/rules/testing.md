---
globs: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"]
---
# Testing Standards

## Coverage Requirements

Every PR must test: happy path, error handling, edge cases, all branching logic.

## Conventions

- Files: `*.test.ts` / `*.test.tsx` alongside source
- Import actual production code, not reimplementations
- Add `data-testid="kebab-case-name"` to interactive elements
- Query order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- **NEVER use CSS class selectors**

## Test Conditional UI States

```typescript
// BAD: Only tests default
it("renders", () => { expect(screen.getByText(/desc/)).toBeInTheDocument() })

// GOOD: Tests both states
it("unchecked", () => { expect(screen.queryByText(/opt/)).not.toBeInTheDocument() })
it("checked", () => { fireEvent.click(checkbox); expect(screen.getByText(/opt/)).toBeInTheDocument() })
```

## Playwright Snapshots

**Use Docker** (CI runs Linux):

```bash
docker run --rm -v $(pwd):/app -w /app --ipc=host \
  mcr.microsoft.com/playwright:v1.57.0-noble \
  sh -c "npm ci && npx playwright test --update-snapshots"
```

Only commit `*-linux.png`. Docker version must match `package.json`.

## Review Responses

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests." | "Out of scope" / "Later" |
