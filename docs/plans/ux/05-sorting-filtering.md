# 05: Add Sorting & Filtering to List Pages

**Priority:** #5 (High)
**Confidence:** 8/10
**Effort:** Medium (3-5 days)
**Dependencies:** None

## Problem

Actor filmographies, death lists, and cast lists have no sort controls. Users see a default order (usually by year or popularity) with no way to reorder by different criteria. On pages with long lists (e.g., "All Deaths" with thousands of entries, or actor filmographies with 100+ credits), this makes it difficult to find specific information.

## Solution

### UX Design

Add a compact sort control to list pages. The control should:

- Appear directly above the list
- Show the current sort criterion and direction
- Be a dropdown/select for the sort field with a toggle for ascending/descending
- Persist the selection in the URL query string (e.g., `?sort=year&dir=desc`) for shareability

```
┌─────────────────────────────────────────┐
│  Sort by: [Year ▾]  [↓ Newest first]   │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ Movie Title (2023)         💀   │    │
│  │ Movie Title (2021)         💀💀 │    │
│  │ Movie Title (2019)              │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Sort Options by Page

| Page | Default Sort | Available Sorts |
|------|-------------|----------------|
| Actor filmography | Year (newest) | Year, Title (A-Z), Deaths |
| All Deaths | Date (most recent) | Date, Name (A-Z), Age at Death |
| Movie cast list | Billing order | Billing, Name (A-Z), Age |
| Notable Deaths | Date (most recent) | Date, Name (A-Z), Popularity |
| Deaths by Decade | Date | Date, Name (A-Z), Age at Death |

## Technical Implementation

### Shared SortControl Component

**File:** `src/components/common/SortControl.tsx` (new)

```tsx
interface SortOption {
  value: string
  label: string
}

interface SortControlProps {
  options: SortOption[]
  value: string
  direction: "asc" | "desc"
  onSort: (field: string, direction: "asc" | "desc") => void
}
```

Features:
- Dropdown select for sort field
- Toggle button for ascending/descending
- URL query string sync via `useSearchParams()`
- Compact design that works on mobile

### Server-Side Sorting

For paginated pages (All Deaths, Notable Deaths, Deaths by Decade), sorting must happen server-side:

**Files:** Relevant route handlers in `server/src/routes/`

Add `sort` and `dir` query parameters to existing endpoints:

```typescript
const validSorts = ["date", "name", "age"] as const
const sort = validSorts.includes(req.query.sort) ? req.query.sort : "date"
const dir = req.query.dir === "asc" ? "ASC" : "DESC"
```

Map sort fields to SQL columns with parameterized ORDER BY:

```typescript
const sortColumnMap: Record<string, string> = {
  date: "a.deathday",
  name: "a.name",
  age: "EXTRACT(YEAR FROM age(a.deathday::date, a.birthday::date))",
}
```

### Client-Side Sorting

For non-paginated lists (actor filmography, movie cast), sort client-side:

```typescript
const sortedFilmography = useMemo(() => {
  return [...filmography].sort((a, b) => {
    // Sort logic based on selected field and direction
  })
}, [filmography, sortField, sortDirection])
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/common/SortControl.tsx` (new) | Shared sort control component |
| `src/pages/ActorPage.tsx` | Add sort control to filmography section |
| `src/pages/DeathsAllPage.tsx` (or equivalent) | Add server-side sort params |
| `src/pages/DeathsNotablePage.tsx` (or equivalent) | Add server-side sort params |
| Server route files (as needed) | Accept sort/dir query params |

## Anti-Patterns

1. **Don't add filtering without sorting** -- Sorting is the simpler, higher-value feature. Filtering (by decade, by cause of death, etc.) is a separate, more complex feature that can come later.
2. **Don't sort paginated data client-side** -- If the list is paginated, sorting must happen server-side to be correct across pages.
3. **Don't add too many sort options** -- 3-4 per page is sufficient. More creates decision paralysis.
4. **Don't use a full-featured data table** -- This isn't an admin panel. A simple sort dropdown is enough.
5. **Don't break existing URL patterns** -- Sort params go in query strings (`?sort=year&dir=desc`), not in the path.
