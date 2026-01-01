---
globs: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"]
---
# Extended Testing Standards

## Test Conditional UI States

When UI text or elements change based on state/props (e.g., checkbox toggles, filters, loading states), write tests for EACH condition:

```typescript
// BAD: Only tests default state
it("renders description", async () => {
  expect(screen.getByText(/some description/)).toBeInTheDocument()
})

// GOOD: Tests both states of a toggle
it("shows filtered description when unchecked", async () => {
  expect(screen.getByText(/without optional content/)).toBeInTheDocument()
  expect(screen.queryByText(/optional content/)).not.toBeInTheDocument()
})

it("shows full description when checked", async () => {
  fireEvent.click(screen.getByRole("checkbox"))
  expect(screen.getByText(/with optional content/)).toBeInTheDocument()
})
```

## Playwright Visual Snapshots

ALWAYS use Docker to generate/update Playwright visual regression snapshots. This ensures CI compatibility since CI runs on Linux:

```bash
# Update snapshots using the Playwright Docker image (match version in package.json)
docker run --rm -v /path/to/project:/app -w /app --ipc=host \
  mcr.microsoft.com/playwright:v1.57.0-noble \
  sh -c "npm ci && npx playwright test --update-snapshots --grep 'test name'"
```

- Only commit Linux snapshots (`*-linux.png`), never darwin/macOS snapshots
- Match the Docker image version to the Playwright version in package.json