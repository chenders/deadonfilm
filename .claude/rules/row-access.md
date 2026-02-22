---
globs: ["server/src/**/*.ts"]
---
# Database Row Access Safety

NEVER access `rows[0]` without a safety guard. Copilot flags every instance.

## For count/aggregate queries (always returns a row):
```typescript
const count = parseInt(result.rows[0]?.count ?? "0", 10)
```

## For lookup queries (may return no rows):
```typescript
const actor = result.rows[0]
if (!actor) {
  return res.status(404).json({ error: { message: "Actor not found" } })
}
```

## For stats queries (multiple fields from one row):
```typescript
const stats = result.rows[0]
if (!stats) {
  return res.json({ total: 0, average: 0 })
}
const total = parseInt(stats.total ?? "0", 10)
```
