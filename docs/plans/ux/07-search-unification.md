# 07: Unify Home Search with Global Search Modal

**Priority:** #7 (Medium)
**Confidence:** 7/10
**Effort:** Small (1-2 days)
**Dependencies:** People Search (#01) -- benefits from same search capabilities

## Problem

The site has two search experiences:

1. **Home page**: Inline `SearchBar` component with results dropdown directly below the input
2. **Other pages**: `SearchModal` triggered by Cmd+K or clicking the search icon in the header

On the home page, pressing Cmd+K opens the search modal **on top of** the already-visible inline search bar. This creates a confusing double-search experience where both the modal and the inline bar are rendered simultaneously.

## Solution

### Option A: Intercept Cmd+K on Home (Recommended)

When the user is on the home page and presses Cmd+K, focus the existing inline search bar instead of opening the modal.

This is the simpler approach:
- No visual changes
- Home page search stays inline (the primary UX)
- Cmd+K becomes a "focus search" shortcut on home, and "open modal" everywhere else
- The "/" shortcut can also focus the inline bar on home

### Option B: Modal Everywhere

Remove the inline search bar from the home page entirely. Use the search modal as the universal search pattern on every page.

This is more disruptive:
- Changes the home page's primary interaction
- Loses the "search is front and center" feel
- Would need to redesign the home page hero area

**Recommendation: Option A** -- minimal disruption, fixes the double-search bug.

## Technical Implementation (Option A)

### File: `src/components/search/GlobalSearchProvider.tsx`

The provider currently handles Cmd+K globally:

```typescript
// Current: always opens modal
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault()
    setIsOpen(prev => !prev)
  }
}
```

Add home page detection and delegate to inline search:

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault()

    // On home page, focus the inline search bar instead
    const inlineSearchInput = document.querySelector<HTMLInputElement>(
      '[data-testid="home-search-input"]'
    )
    if (inlineSearchInput) {
      inlineSearchInput.focus()
      return
    }

    // On other pages, toggle the modal
    setIsOpen(prev => !prev)
  }
}
```

### File: `src/components/search/SearchBar.tsx`

Add `data-testid="home-search-input"` to the search input so the GlobalSearchProvider can find it:

```tsx
<input
  data-testid="home-search-input"
  type="text"
  placeholder={placeholder}
  ...
/>
```

### "/" Shortcut

Apply the same logic: on home page, focus inline bar. Elsewhere, open modal.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/search/GlobalSearchProvider.tsx` | Intercept Cmd+K on home page, focus inline search instead of opening modal |
| `src/components/search/SearchBar.tsx` | Add `data-testid` to input for discoverability |

## Anti-Patterns

1. **Don't remove the inline search from the home page** -- It's the site's primary interaction. The modal is a supplement, not a replacement.
2. **Don't use a ref passed through multiple layers** -- The `data-testid` + `querySelector` approach is simpler than threading a ref from GlobalSearchProvider through App through HomePage through SearchBar.
3. **Don't disable the modal on the home page entirely** -- There may be edge cases where the modal is useful (e.g., from a deep-linked home page with URL params). Just intercept the keyboard shortcut.
