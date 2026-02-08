# Plan 10: Pagination SEO

**Impact: Low | Effort: Small | Dependencies: #1 (pre-rendering ensures tags are visible to bots)**

## Problem

Dead on Film has several paginated pages — `/deaths/all`, search results, and curated lists that span multiple pages. Currently these pages have no pagination-specific SEO handling:

- No self-referencing canonical URLs (Google may treat `?page=2` as duplicate content)
- No `rel="prev"` / `rel="next"` link tags (crawlers don't understand page relationships)
- Deep pagination pages (page 20+) are indexed equally with page 1, wasting crawl budget
- Paginated pages share identical or near-identical meta descriptions
- No indication to crawlers which page is the "primary" version

While Google deprecated `rel="prev/next"` as a ranking signal in 2019, it still uses these hints for crawl discovery. And canonical URLs remain critical for duplicate content prevention.

## Solution

### Self-referencing Canonical URLs

Every paginated page should have a canonical URL that includes the page parameter:

```html
<!-- /deaths/all?page=3 -->
<link rel="canonical" href="https://deadonfilm.com/deaths/all?page=3" />
```

Page 1 should canonicalize to the clean URL (without `?page=1`):

```html
<!-- /deaths/all or /deaths/all?page=1 -->
<link rel="canonical" href="https://deadonfilm.com/deaths/all" />
```

### Prev/Next Link Tags

Add navigation hints in `<head>`:

```html
<!-- /deaths/all?page=3 -->
<link rel="prev" href="https://deadonfilm.com/deaths/all?page=2" />
<link rel="next" href="https://deadonfilm.com/deaths/all?page=4" />
```

Page 1 has no `rel="prev"`. The last page has no `rel="next"`.

### Deep Pagination Handling

Pages beyond page 20 should be `noindex` to conserve crawl budget:

```html
<!-- /deaths/all?page=25 -->
<meta name="robots" content="noindex, follow" />
```

Note: `follow` is kept so crawlers can still discover linked content on deep pages.

### Unique Meta Descriptions

Each paginated page should have a distinct meta description:

```
Page 1: "All recorded actor deaths — browse 2,847 actors who have passed away, sorted by date."
Page 2: "Actor deaths (page 2 of 95) — continuing the full list of deceased actors."
Page 3: "Actor deaths (page 3 of 95) — actors who passed away, sorted by date."
```

### Sitemap Considerations

- Include only the first 5-10 pages of each paginated set in the sitemap
- Deep pages are discoverable through pagination links, not sitemap
- Set lower priority for paginated pages vs. page 1

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/usePaginationSeo.ts` | Create | Hook that manages pagination meta tags |
| `src/pages/AllDeathsPage.tsx` | Modify | Apply pagination SEO hook |
| `src/pages/SearchResultsPage.tsx` | Modify | Apply pagination SEO hook (if paginated) |
| `server/src/lib/sitemap-generator.ts` | Modify | Limit pagination pages in sitemap |
| `src/components/seo/PaginationHead.tsx` | Create | Component rendering pagination link tags |

## Implementation Notes

- The `usePaginationSeo` hook should accept `currentPage`, `totalPages`, and `baseUrl` and set the appropriate `<link>` and `<meta>` tags via `react-helmet-async`
- Ensure `?page=1` redirects to the clean URL (301) to prevent duplicate indexing
- The `noindex` threshold (page 20) should be configurable
- Test with Google's URL Inspection tool to verify canonical and pagination tags are recognized
- Don't use `rel="canonical"` pointing all pages to page 1 — this tells Google to only index page 1 and ignore content on other pages

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Indexed pagination pages | GSC Coverage | Measure before | Reduced deep pages, maintained shallow |
| Duplicate content warnings | GSC | Measure before | 0 pagination-related duplicates |
| Crawl budget on pagination | GSC Crawl Stats | Measure before | Reduced crawl of pages 20+ |
| Page 1 rankings | GSC Performance | Measure before | Stable or improved |
