# 04: Improve Empty States / No-Results Experience

**Priority:** #4 (High)
**Confidence:** 8/10
**Effort:** Small (1-2 days)
**Dependencies:** People Search (#01) -- to add "try People search" hint

## Problem

When a search returns no results, the user sees "End of Reel" -- a thematic message that matches the site's dark humor but offers zero guidance on what to do next. There are no suggestions, no browse links, and no indication of whether the query was mistyped or simply not in the database.

This is a dead end that loses users who might otherwise explore the site.

## Solution

### UX Design

Keep "End of Reel" as the heading (it's on-brand), but add helpful content below it:

```
┌──────────────────────────────────────────┐
│           🎬 End of Reel                  │
│                                          │
│  No results for "Braking Bad"            │
│                                          │
│  Suggestions:                            │
│  • Check your spelling                   │
│  • Try searching for people instead      │
│  • Browse popular content below          │
│                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │Popular │ │Popular │ │Popular │       │
│  │Movie 1 │ │Movie 2 │ │Movie 3 │       │
│  └────────┘ └────────┘ └────────┘       │
│                                          │
│  Or browse: Deaths · Genres · Causes     │
└──────────────────────────────────────────┘
```

### Content Strategy

1. **Echo the query**: Show what was searched so users can spot typos
2. **Suggestions list**: Contextual tips based on current search type
3. **Popular content**: Show 3-4 popular movies/shows as fallback exploration
4. **Browse links**: Direct links to major content sections

### Context-Aware Suggestions

| Current Type | Suggestions |
|-------------|-------------|
| Movies | "Try TV Shows instead", "Search for the director's name in People" |
| TV Shows | "Try Movies instead", "Try searching by actor name in People" |
| People | "Try Movies or TV Shows -- search by title instead of actor name" |
| All | "Check your spelling", "Try a shorter query" |

## Technical Implementation

### SearchBar & SearchModal

**Files:** `src/components/search/SearchBar.tsx`, `src/components/search/SearchModal.tsx`

Replace the current empty-state content (just "End of Reel" text) with a richer component:

```tsx
{results.length === 0 && query.length >= 2 && (
  <EmptySearchState
    query={query}
    mediaType={mediaType}
    onTypeChange={setMediaType}
  />
)}
```

### New Component: EmptySearchState

**File:** `src/components/search/EmptySearchState.tsx` (new)

```tsx
interface EmptySearchStateProps {
  query: string
  mediaType: SearchMediaType
  onTypeChange: (type: SearchMediaType) => void
}
```

The component:
1. Shows "End of Reel" heading
2. Echoes the query: `No results for "{query}"`
3. Shows contextual suggestions based on `mediaType`
4. Optionally shows popular movies (can use a static list or fetch from existing popular endpoint)
5. Shows browse links: Deaths, Genres, Causes of Death

### Popular Content Fallback

Either:
- **Static list**: Hardcode 4-5 perennially popular titles (The Godfather, Breaking Bad, etc.) -- simple, no API call
- **Dynamic**: Fetch from an existing endpoint if available -- better but adds a network request on empty results

Recommend the static list for simplicity. These can be updated periodically.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/search/EmptySearchState.tsx` (new) | Empty state component with suggestions and browse links |
| `src/components/search/SearchBar.tsx` | Use EmptySearchState instead of plain "End of Reel" |
| `src/components/search/SearchModal.tsx` | Use EmptySearchState instead of plain "End of Reel" |

## Anti-Patterns

1. **Don't remove "End of Reel"** -- It's on-brand. Supplement it, don't replace it.
2. **Don't auto-correct queries** -- Suggesting "did you mean..." requires fuzzy matching infrastructure that doesn't exist yet. Just echo the query so users can self-correct.
3. **Don't show too many suggestions** -- 3-4 items max. The empty state should guide, not overwhelm.
4. **Don't fetch popular content on every empty result** -- Use a static list or cache aggressively. Empty states shouldn't add latency.
