---
globs: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"]
---
# Extended Testing Standards

## Test All Conditional UI States

When UI changes based on state/props, you MUST test EACH condition:

```typescript
// WRONG: Only tests default state
it("renders description", async () => {
  expect(screen.getByText(/some description/)).toBeInTheDocument()
})

// CORRECT: Tests both states of a toggle
it("shows filtered description when unchecked", async () => {
  expect(screen.getByText(/without optional content/)).toBeInTheDocument()
  expect(screen.queryByText(/optional content/)).not.toBeInTheDocument()
})

it("shows full description when checked", async () => {
  fireEvent.click(screen.getByRole("checkbox"))
  expect(screen.getByText(/with optional content/)).toBeInTheDocument()
})
```

---

## Playwright Visual Snapshots

**IMPORTANT**: ALWAYS use Docker to generate/update visual regression snapshots. CI runs on Linux, so local macOS snapshots will fail.

```bash
# Update snapshots using Playwright Docker image
# Match the version to package.json
docker run --rm -v /path/to/project:/app -w /app --ipc=host \
  mcr.microsoft.com/playwright:v1.57.0-noble \
  sh -c "npm ci && npx playwright test --update-snapshots --grep 'test name'"
```

| Rule | Requirement |
|------|-------------|
| Commit | Only Linux snapshots (`*-linux.png`) |
| Never commit | macOS/darwin snapshots |
| Docker version | MUST match Playwright version in package.json |