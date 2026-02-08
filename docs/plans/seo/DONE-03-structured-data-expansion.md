# Plan 03: Structured Data Expansion

**Impact: High | Effort: Small | Dependencies: #1 (pre-rendering improves reliability)**

## Problem

Dead on Film currently implements JSON-LD schemas for Movie, Person, WebSite, and BreadcrumbList. This covers movie and actor pages but leaves significant gaps:

- **Show pages** have no TVSeries schema — missing rich results for TV content
- **Episode pages** have no TVEpisode schema — same issue
- **Curated list pages** (Death Watch, Forever Young, causes of death) have no CollectionPage schema
- **The WebSite schema** lacks a SearchAction — no sitelinks search box in SERPs
- **No FAQPage schema** on pages with Q&A-style content

These gaps mean the site isn't eligible for rich results on a large portion of its pages.

## Solution

Extend the existing schema builder architecture in `src/utils/schema.ts` with new schema types, and wire them into the appropriate page components via `src/components/seo/JsonLd.tsx`.

### New Schemas

**TVSeries** (show pages):
- `name`, `description`, `image`, `datePublished` (first air date)
- `numberOfSeasons`, `numberOfEpisodes`
- `actor` array linking to Person schemas
- Custom `aggregateRating` or extension for mortality statistics

**TVEpisode** (episode pages):
- `name`, `description`, `episodeNumber`, `seasonNumber`
- `partOfSeries` linking to the parent TVSeries
- `actor` array for guest/recurring cast

**CollectionPage** (curated lists):
- `name`, `description`
- `hasPart` array referencing the items in the collection
- Suitable for Death Watch, Forever Young, all-deaths, cause-of-death pages

**SearchAction** (added to existing WebSite schema):
- `potentialAction` with `SearchAction` type
- `target` URL template pointing to `/search?q={search_term_string}`
- Enables the sitelinks search box in Google SERPs

**FAQPage** (where applicable):
- For the FAQ authority page (Recommendation #4)
- Potentially for the Methodology page with Q&A formatting

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/schema.ts` | Modify | Add TVSeries, TVEpisode, CollectionPage, SearchAction, FAQPage builders |
| `src/components/seo/JsonLd.tsx` | Verify | Ensure it handles new schema types (likely no changes needed) |
| `src/pages/ShowPage.tsx` | Modify | Add TVSeries JSON-LD |
| `src/pages/EpisodePage.tsx` | Modify | Add TVEpisode JSON-LD |
| `src/pages/DeathWatchPage.tsx` | Modify | Add CollectionPage JSON-LD |
| `src/pages/ForeverYoungPage.tsx` | Modify | Add CollectionPage JSON-LD |
| `src/pages/AllDeathsPage.tsx` | Modify | Add CollectionPage JSON-LD |
| `src/App.tsx` | Modify | Update WebSite schema with SearchAction |

## Implementation Notes

- Follow the existing pattern in `schema.ts`: each builder function returns a typed JSON-LD object
- Use Schema.org's `@type` values exactly: `TVSeries`, `TVEpisode`, `CollectionPage`, `FAQPage`
- Test each schema with Google's Rich Results Test before deploying
- SearchAction `target` should use the URL template format: `https://deadonfilm.com/search?q={search_term_string}`
- CollectionPage `hasPart` should reference a reasonable number of items (not thousands — use the first page's worth)

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Rich result impressions | GSC Rich Results | 0 for shows/episodes | Measurable within 30 days |
| Schema validation errors | Google Rich Results Test | N/A | 0 errors |
| Sitelinks search box | Google SERP | Not present | Present for brand queries |
| Enhanced SERP listings | Manual check | Movies only | Movies, shows, episodes, lists |
