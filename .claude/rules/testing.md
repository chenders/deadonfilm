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

## Redis in Tests: When to Mock vs Real

### Use ioredis-mock for:
- **Unit tests** of code that uses basic Redis commands (get, set, del, expire, etc.)
- **Testing Redis client configuration** (connection, retry logic)
- **Simple cache operations** that don't involve complex Redis features

```typescript
import { describe, it, expect, vi } from "vitest"
import RedisMock from "ioredis-mock"

// Mock ioredis BEFORE any imports that use Redis
vi.mock("ioredis", () => ({
  default: RedisMock,
}))

// Now import code that uses Redis
import { getCached, setCached } from "./cache.js"

it("caches data", async () => {
  await setCached("key", "value", 60)
  const result = await getCached("key")
  expect(result).toBe("value")
})
```

**Example:** `server/src/lib/jobs/redis.test.ts` uses ioredis-mock to test Redis client configuration.

### Use real Redis (Docker) for:
- **BullMQ integration tests** (queue-manager, worker tests)
- **Tests that use advanced Redis features** not supported by ioredis-mock
- **End-to-end tests** that need full Redis functionality

**Why:** BullMQ uses advanced Redis commands (like `client`) that ioredis-mock doesn't support. Integration tests MUST use real Redis.

**Setup:**
1. **Locally:** Start Redis container: `docker run -d -p 6380:6379 redis:7-alpine`
2. **CI:** Redis container starts automatically (see `.github/workflows/ci.yml`)
3. **Environment:** Set `REDIS_JOBS_URL=redis://localhost:6380` in test environment

```typescript
// No ioredis mock - uses real Redis
import { queueManager } from "./queue-manager.js"
import { JobWorker } from "./worker.js"

beforeAll(async () => {
  await queueManager.initialize() // Connects to real Redis
  // ...
})
```

**Examples:** `server/src/lib/jobs/__tests__/queue-manager.test.ts` and `worker.test.ts` use real Redis.

### Decision Tree

```
Does the code use BullMQ?
├─ YES → Use real Redis (Docker)
└─ NO → Does it use complex Redis features?
    ├─ YES → Use real Redis
    └─ NO → Use ioredis-mock
```

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

## Test Cache Scenarios

When testing routes/functions with caching, test BOTH paths:

```typescript
// Cache miss - data fetched from source
it("fetches from database on cache miss", async () => {
  vi.mocked(getCached).mockResolvedValue(null)
  await handler(req, res)
  expect(setCached).toHaveBeenCalledWith(expectedKey, expectedData, expectedTTL)
})

// Cache hit - data returned from cache
it("returns cached data on cache hit", async () => {
  vi.mocked(getCached).mockResolvedValue(cachedData)
  await handler(req, res)
  expect(jsonSpy).toHaveBeenCalledWith(cachedData)
  expect(fetchFromDb).not.toHaveBeenCalled()
})
```

## Avoid Unused Variables

Remove unused variables before committing, especially in tests:

```typescript
// BAD - unused result
const result = await source.lookup(actor)
expect(mockFetch).toHaveBeenCalled()

// GOOD - no unused variable
await source.lookup(actor)
expect(mockFetch).toHaveBeenCalled()
```

## Review Responses

| Acceptable | Unacceptable |
|------------|--------------|
| "Fixed. Added tests." | "Out of scope" / "Later" |
