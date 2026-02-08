# Plan 05: Crawlable Search Results Page

**Impact: Medium | Effort: Small | Dependencies: #1 (pre-rendering ensures bots see results)**

## Problem

Dead on Film has a search feature (Cmd+K modal) powered by a backend API, but search results exist only in a transient modal overlay. There is no URL-addressable search results page. This means:

- Long-tail queries like "Titanic actors who died" can't become landing pages
- Users can't share or bookmark search results
- Search engines can't crawl or index search results
- The site misses a significant long-tail keyword opportunity

## Solution

Create a `/search?q=...` route that renders search results as a full page with proper SEO attributes. The existing search API (`/api/search`) already returns the data — this is purely a frontend page that consumes it.

### Page Features

- URL-addressable: `/search?q=titanic+actors`
- Full page layout with header, breadcrumbs, footer
- Results grouped by type: actors, movies, shows, episodes
- Each result links to its detail page (generating internal links for crawlers)
- Unique meta tags per query: `<title>Search results for "Titanic actors" - Dead on Film</title>`
- `noindex` for empty results or very short queries (< 3 chars)
- Canonical URL with normalized query string

### Integration with Existing Search

- The Cmd+K modal stays as-is for quick navigation
- Add a "View all results" link in the modal that navigates to `/search?q=...`
- The search results page uses the same API endpoint as the modal
- Consider adding the search page URL to the sitemap for popular queries

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/SearchResultsPage.tsx` | Create | Full search results page |
| `src/App.tsx` | Modify | Add `/search` route |
| `src/components/search/SearchModal.tsx` | Modify | Add "View all results" link |
| `server/src/lib/sitemap-generator.ts` | Modify | Optionally add popular search URLs |
| `server/src/index.ts` | Verify | Ensure `/search` route serves the SPA |

## Implementation Notes

- Use `useSearchParams()` from React Router to read the `q` parameter
- Debounce API calls as the user types (if adding a search input on the page)
- Set `<link rel="canonical" href="/search?q=normalized+query">` with lowercase, trimmed query
- Don't index empty-result pages: add `<meta name="robots" content="noindex">` when results are empty
- The search API should handle the query server-side, so pre-rendered HTML will include actual results
- Paginate results if > 20 items, with proper pagination SEO (ties into Recommendation #10)

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| /search page organic traffic | GA | 0 | Measurable in 60 days |
| Long-tail keyword rankings | GSC Performance | None for search queries | New keyword appearances |
| Search page indexing | GSC Coverage | 0 /search pages | Popular queries indexed |
| Click-through to detail pages | GA | N/A | > 50% of search page visitors |
