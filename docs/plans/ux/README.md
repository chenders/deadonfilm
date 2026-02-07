# UX Audit & People Search Feature

## Executive Summary

A Senior UX Designer and Principal Engineer audited Dead on Film's user experience and identified 10 high-impact improvements, ranked by their effect on site success. The top priority -- and only missing core feature -- is **People Search**: the ability to search for actors and other people directly.

## How Improvements Were Ranked

Each improvement was scored on four axes:

| Axis | Weight | Description |
|------|--------|-------------|
| **User Impact** | 40% | How many users benefit, and how much |
| **Site Mission Alignment** | 25% | Does it advance "look up who has died"? |
| **Implementation Confidence** | 20% | Do we know exactly what to build? |
| **Effort vs. Payoff** | 15% | Is the ROI worthwhile? |

## Top 10 Improvements

| Rank | Improvement | Impact | Confidence | Effort | Plan |
|------|-------------|--------|------------|--------|------|
| 1 | **People Search** | Critical | 10/10 | Medium | [01-people-search.md](./01-people-search.md) |
| 2 | **Mobile Tooltip Fix** | Critical | 9/10 | Small | [02-mobile-tooltip-fix.md](./02-mobile-tooltip-fix.md) |
| 3 | **Persistent Site Navigation** | High | 9/10 | Medium | [03-site-navigation.md](./03-site-navigation.md) |
| 4 | **Empty States / No-Results** | High | 8/10 | Small | [04-empty-states.md](./04-empty-states.md) |
| 5 | **Sorting & Filtering** | High | 8/10 | Medium | [05-sorting-filtering.md](./05-sorting-filtering.md) |
| 6 | **Quick Actions Mobile** | High | 7/10 | Small | [06-quick-actions-mobile.md](./06-quick-actions-mobile.md) |
| 7 | **Search Unification** | Medium | 7/10 | Small | [07-search-unification.md](./07-search-unification.md) |
| 8 | **Share Functionality** | Medium | 7/10 | Small | [08-share-functionality.md](./08-share-functionality.md) |
| 9 | **Breadcrumb Navigation** | Medium | 7/10 | Small | [09-breadcrumbs.md](./09-breadcrumbs.md) |
| 10 | **About Page** | Medium | 6/10 | Small | [10-about-page.md](./10-about-page.md) |

## Key Findings

### The Core Gap: People Search

The site's tagline is "Search for a movie or TV show to see which cast members have passed away" -- but users can't search for people directly. With 569K people in the database (20K deceased, 123K with photos), the data is there. The search infrastructure just stops at movies and TV shows.

Adding "People" as a 4th toggle in the existing search UI (alongside All / Movies / TV Shows) fills this gap with minimal UX disruption. The user chose "People" over "Actors" as the label since the database includes documentary subjects and other non-actors.

### Database Reality Check

- **569,330 people** in the database
- **81% have zero TMDB popularity** -- unfiltered search would return obscure results
- **123,368 have photos** -- filter to `profile_path IS NOT NULL` at minimum
- **ILIKE search takes ~85ms** without an index -- pg_trgm brings this to <5ms
- **`searchPerson()` already exists** in `server/src/lib/tmdb.ts` but isn't exposed to users

### Mobile Is Broken in Key Places

Custom tooltips on ActorPage use `onMouseEnter`/`onMouseLeave` only -- completely invisible on touch devices. The shared `HoverTooltip` component already handles click-to-toggle, so this is a straightforward swap.

QuickActions tooltips use CSS `group-hover:opacity-100` -- also invisible on mobile. These need always-visible short descriptions on small screens.

### Navigation Is a Dead End

Once a user leaves the home page, the only way to discover new content is through the search modal (Cmd+K). There are no nav links, no browse section, no breadcrumbs. The Header contains only: logo, theme toggle, and search trigger.

## Things We Considered But Dismissed

| Idea | Why Not |
|------|---------|
| **pg_trgm as primary person search** | TMDB search has better relevance ranking. Use pg_trgm as a supplement for local DB matching only. |
| **Virtualized lists** (react-window) | Filmographies are hundreds of items, not thousands. Paginate server-side instead. |
| **Client-side page transitions** | Adds perceived latency and scroll position bugs. |
| **Rename "Death Watch"** | The morbid tone is the brand. Fix discoverability, not naming. |
| **Social login / user accounts** | Read-only content site. No authentication needed. |
| **Infinite scroll** | Paginated URLs are better for SEO, sharing, and accessibility. |
| **Unfiltered 569K actor search** | 81% have zero popularity and no photos. Always filter. |

## Anti-Patterns to Avoid

1. **Don't add features without mobile testing** -- Half the tooltip issues exist because desktop-only interactions were never tested on touch
2. **Don't search unfiltered** -- Always require `profile_path IS NOT NULL` minimum for people results
3. **Don't over-engineer search** -- TMDB's relevance ranking is already good; supplement with local DB, don't replace
4. **Don't break existing search UX** -- People search adds to the toggle; it doesn't change how movie/TV search works
5. **Don't add navigation that competes with search** -- Nav links should complement search, not duplicate it

## Implementation Sequence

Recommended order based on dependencies and impact:

```
1. People Search (01)     -- Core missing feature, no dependencies
2. Mobile Tooltip Fix (02) -- Quick win, critical accessibility fix
3. Quick Actions Mobile (06) -- Related mobile fix, do alongside #2
4. Empty States (04)       -- Quick win, improves search experience
5. Site Navigation (03)    -- Medium effort, high impact
6. Search Unification (07) -- Builds on People Search work
7. Sorting & Filtering (05) -- Independent, medium effort
8. Breadcrumbs (09)        -- Quick win after navigation exists
9. Share Functionality (08) -- Independent, quick win
10. About Page (10)        -- Lowest priority, do last
```

## Data Sources

All database statistics were gathered via direct PostgreSQL queries against the production schema. File paths were verified against the current codebase on the `feat/dark-theme` branch.
