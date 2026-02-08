# Plan 06: Content Hub Strategy + Internal Linking

**Impact: Medium | Effort: Medium | Dependencies: #1 (pre-rendering), #4 (authority pages provide link targets)**

## Problem

Dead on Film has rich content pages (actors, movies, shows, curated lists) but weak internal linking between them. Each page exists somewhat in isolation — a movie page shows its cast but doesn't link to related movies, similar content, or thematic hubs. This limits:

- **Crawl discovery**: Bots find pages primarily through sitemaps, not organic link structures
- **PageRank distribution**: Link equity pools on high-traffic pages instead of flowing to deeper content
- **User engagement**: Visitors see one page and leave instead of exploring related content
- **Topical authority**: Google rewards sites that demonstrate comprehensive coverage of a topic through linked content clusters

## Solution

Restructure the site's content into a hub-and-spoke model with deliberate cross-linking.

### Hub Pages (Pillar Content)

These pages serve as topical anchors that link to many related pages:

| Hub | Spoke Examples |
|-----|---------------|
| `/deaths/causes/{cause}` (e.g., cancer) | Individual actor pages who died of that cause |
| `/deaths/decades/{decade}` (e.g., 2020s) | Actor and movie pages from that era |
| `/deaths/watch` (Death Watch) | Individual actor pages on the watch list |
| `/deaths/young` (Forever Young) | Actors who died young, linking to their filmographies |
| `/methodology` (from #4) | Movie/actor pages demonstrating the calculations |

### Spoke Enhancements (Detail Pages)

Add cross-linking sections to existing detail pages:

**Actor pages**:
- "Also appeared in" — movies with high mortality (link to those movie pages)
- "Died of same cause" — other actors with the same cause of death
- "Similar era" — actors from the same birth decade

**Movie pages**:
- "Related movies" — same director, similar mortality rate, or same era
- "See also" — link to the relevant cause-of-death hub if many cast died of the same cause
- "From this decade" — link to the decade hub

**Show pages**:
- "Related shows" — similar genre, network, or era
- "Notable cast deaths" — highlight actors with interesting mortality stories

### Breadcrumb Expansion

Current breadcrumbs are basic. Expand to show the full content hierarchy:
- `Home > Movies > The Godfather (1972)`
- `Home > Deaths > By Cause > Cancer > [Actor Name]`
- `Home > Shows > Breaking Bad > Season 1 > Episode 1`

### Internal Link Components

Create reusable components:
- `<RelatedContent>` — displays 3-5 related items with thumbnails
- `<SeeAlso>` — text-based link list for thematic connections
- `<ContentBreadcrumb>` — expanded breadcrumb with multiple paths

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/components/content/RelatedContent.tsx` | Create | Reusable related content section |
| `src/components/content/SeeAlso.tsx` | Create | Thematic cross-link section |
| `src/pages/ActorPage.tsx` | Modify | Add related actors/movies sections |
| `src/pages/MoviePage.tsx` | Modify | Add related movies section |
| `src/pages/ShowPage.tsx` | Modify | Add related shows section |
| `server/src/routes/actors.ts` | Modify | Add related actors API endpoint |
| `server/src/routes/movies.ts` | Modify | Add related movies API endpoint |
| `src/components/layout/Breadcrumb.tsx` | Modify | Expand breadcrumb paths |

## Implementation Notes

- "Related" algorithms should be simple: same cause of death, same decade, shared cast members, similar mortality rate
- Don't over-link — 3-5 related items per section is optimal
- Use `<a href>` tags with real URLs (not `onClick` handlers) for all cross-links
- Ensure related content sections are present in pre-rendered HTML
- Consider lazy-loading related content below the fold to avoid impacting LCP
- Add `rel="nofollow"` to NO internal links — let PageRank flow freely

## Measurement

| Metric | Tool | Baseline | Target |
|--------|------|----------|--------|
| Pages per session | GA | Measure before | +30% in 60 days |
| Internal links per page | Screaming Frog / GSC | Measure before | +5 links per content page |
| Crawl depth | GSC Crawl Stats | Measure before | Reduced average depth |
| Bounce rate on content pages | GA | Measure before | -10% in 60 days |
| Orphan pages | Screaming Frog | Measure before | 0 orphan content pages |
