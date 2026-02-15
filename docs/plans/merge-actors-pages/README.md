# Merge Actor Profile + Death Details Pages

## Problem Statement

The actor profile page (`/actor/:slug`) and actor death details page (`/actor/:slug/death`) are currently separate pages that share duplicate header content and require an extra click to reach death narratives. This creates UX friction:

- **Drop-off risk**: Users must click "View Full Death Details" to see the richest content about a deceased actor
- **Duplicate headers**: Both pages render the actor photo, name, born/died dates independently
- **Context switching**: Navigating to `/death` loses the filmography context; navigating back loses the death narrative
- **Two API calls per journey**: The actor page calls `/api/actor/:slug`, and the death page calls `/api/death-details/:slug` separately

The goal is to consolidate these into a single actor page that surfaces death information without a separate route, while preserving analytics, SEO equity, and the distinct content types (data tables vs. narrative text).

## How Proposals Were Determined

### Methodology

1. **Component analysis**: Read both page components (`ActorPage.tsx` at 485 lines, `ActorDeathPage.tsx` at 420 lines) to map their sections, data dependencies, and shared elements
2. **Data shape comparison**: Compared `ActorProfileResponse` (actor + filmography + basic death info) with `DeathDetailsResponse` (circumstances, career context, sources, entity links, related celebrities) to understand what data lives where
3. **UI pattern inventory**: Catalogued existing expand/collapse (`DeceasedCard`), tab (`AdminTabs`), tooltip (`HoverTooltip`), and section patterns already in the codebase
4. **Analytics audit**: Reviewed `usePageViewTracking` (fire-and-forget POST to `/api/page-views/track` with 500ms delay) and GA4 integration to understand what tracking must survive the merge
5. **SEO audit**: Reviewed sitemap generation (`sitemap-actors.xml` + `sitemap-death-details.xml`), canonical URLs, and JSON-LD structured data on both pages
6. **UX principles**: Considered F-pattern scanning, progressive disclosure, content-type mixing (narrative prose vs. data tables), and mobile viewport constraints

### Design Constraints

| Constraint | Reason |
|-----------|--------|
| Must 301-redirect `/actor/:slug/death` | Preserve SEO equity from indexed death pages |
| Must track "death details viewed" | Analytics currently uses `actor_death` page type |
| Must handle 3 actor states | Deceased with details, deceased without details, living |
| Must not regress mobile UX | Death narratives are long prose; filmography is compact cards |
| Component extraction required | `LowConfidenceWarning`, `FactorBadge`, `ProjectLink`, `SourceList`, `RelatedCelebrityCard`, `LinkedText` are currently inlined in `ActorDeathPage.tsx` |

## Proposal Comparison

| Dimension | A: Integrated Scroll | B: Tabbed Profile | C: Progressive Story |
|-----------|---------------------|-------------------|---------------------|
| **Philosophy** | Everything visible on one long page | Clean separation via tabs | Teaser with expand/collapse |
| **Death content visibility** | Always visible | Behind tab click | Behind expand click |
| **API strategy** | Parallel fetch both endpoints on load | Lazy-load death data on tab switch | Lazy-load death data on expand |
| **Initial page weight** | Heaviest (both payloads) | Medium (actor only until tab switch) | Lightest (actor only until expand) |
| **SEO for death content** | Best (all content in DOM) | Good (if SSR) or poor (if lazy) | Moderate (teaser in DOM, detail lazy) |
| **Implementation complexity** | Low | Medium (adapt AdminTabs) | Medium (adapt DeceasedCard pattern) |
| **Mobile friendliness** | Long scroll, but natural | Tabs work well on mobile | Compact by default, expands in-place |
| **Analytics migration** | Intersection Observer on death section | Virtual pageview on tab switch | Virtual pageview on expand |
| **Risk of content overload** | High for actors with long narratives | Low (content separated by tab) | Low (collapsed by default) |
| **Disruption to current layout** | High (major reorder) | Medium (adds tab bar) | Low (inserts expandable section) |
| **Files to modify** | ~12 | ~14 | ~12 |

## Recommendation Framework

| If your priority is... | Choose |
|------------------------|--------|
| SEO and content discoverability | **Proposal A** (Integrated Scroll) |
| Clean information architecture | **Proposal B** (Tabbed Profile) |
| Minimal disruption + fast shipping | **Proposal C** (Progressive Story) |
| Mobile-first design | **Proposal B** or **C** |
| Maximum engagement with death content | **Proposal A** (no clicks required) |

## Per-Proposal Summaries

### Proposal A: The Integrated Scroll

**Philosophy**: Single continuous page. Header, biography, death details, filmography, related content all visible on load with no clicks required.

**Pros**:
- Simplest mental model for users -- scroll to see everything
- Best SEO: all content in the DOM on initial render
- No lazy-loading complexity; two parallel API calls on mount
- Death content always visible, maximizing engagement

**Cons**:
- Longest page, especially for actors with extensive death narratives + large filmographies
- Mixes content types (prose narratives interleaved with data cards)
- Heaviest initial page weight (both API payloads)
- Hardest to measure "did user actually read death details" vs. "scrolled past"

**Key risk**: Content overload on mobile for actors like John Wayne (long biography + detailed death narrative + 100+ filmography entries).

**Full plan**: [proposal-a-integrated-scroll.md](./proposal-a-integrated-scroll.md)

---

### Proposal B: The Tabbed Profile

**Philosophy**: Shared header with a tab bar underneath. Overview tab (biography + filmography), Death Details tab (narrative + sources + career context), Related tab (related actors + hub links).

**Pros**:
- Cleanest content separation by type
- Familiar UI pattern (adapts existing `AdminTabs` component)
- Lazy-loads death data only when tab is clicked (lighter initial load)
- Natural analytics boundary (tab switch = virtual pageview)

**Cons**:
- Death content hidden behind a click (same problem we're solving, but lower friction)
- Tab bar adds a new UI element to every actor page, including living actors
- More complex implementation (keyboard navigation, URL hash sync, lazy loading)
- SEO concern: lazy-loaded tab content may not be indexed by crawlers

**Key risk**: If search engines can't see death content behind the tab, we lose SEO equity from the current `/death` pages.

**Full plan**: [proposal-b-tabbed-profile.md](./proposal-b-tabbed-profile.md)

---

### Proposal C: The Progressive Story

**Philosophy**: Insert an expandable death section between the header and biography. Shows a teaser (cause of death, age, location) when collapsed; expands to reveal full narrative, sources, career context, and related celebrities.

**Pros**:
- Minimal disruption to current `ActorPage` layout
- Adapts existing `DeceasedCard` expand/collapse pattern
- Compact by default, respects users who just want filmography
- Lazy-loads death details only on expand (lightest initial load)
- Natural analytics trigger (expand = virtual pageview)

**Cons**:
- Teaser must be compelling enough to encourage expansion
- Long expanded sections push filmography far down the page
- Expand/collapse state isn't reflected in URL (can't deep-link to expanded state)
- Moderate SEO: teaser text is in DOM, but full narrative is lazy-loaded

**Key risk**: If the teaser doesn't entice users to expand, death content engagement could be *lower* than the current separate page.

**Full plan**: [proposal-c-progressive-story.md](./proposal-c-progressive-story.md)

## Shared Implementation Work (All Proposals)

Regardless of which proposal is chosen, the following work is required:

### 1. Component Extraction from `ActorDeathPage.tsx`

These components are currently defined inline and need to be extracted to shared locations:

| Component | Current Location | Target Location |
|-----------|-----------------|-----------------|
| `LowConfidenceWarning` | `ActorDeathPage.tsx:19-57` | `src/components/death/LowConfidenceWarning.tsx` |
| `FactorBadge` | `ActorDeathPage.tsx:60-74` | `src/components/death/FactorBadge.tsx` |
| `ProjectLink` | `ActorDeathPage.tsx:77-116` | `src/components/death/ProjectLink.tsx` |
| `SourceList` | `ActorDeathPage.tsx:119-146` | `src/components/death/SourceList.tsx` |
| `RelatedCelebrityCard` | `ActorDeathPage.tsx:149-170` | `src/components/death/RelatedCelebrityCard.tsx` |

`LinkedText` and `ConfidenceIndicator` are already extracted.

### 2. Route Changes

```
/actor/:slug/death → 301 redirect to /actor/:slug
```

- Add redirect route in `src/App.tsx` (replace the `ActorDeathPage` route)
- Server-side: add 301 redirect in `server/src/routes/actor.ts` for the `/death` suffix

### 3. Sitemap Updates

- Remove `sitemap-death-details.xml` from sitemap index in `server/src/routes/sitemap.ts`
- Remove `getDeathDetailsSitemap()` handler
- Actor sitemap URLs remain unchanged (`/actor/:slug`)

### 4. Internal Link Updates

Pages that link to `/actor/:slug/death` need updating:

- `src/pages/NotableDeathsPage.tsx` (if it links to death pages)
- Admin pages that reference death detail URLs
- The `HoverTooltip` "Read more" link in `ActorPage.tsx:319` itself

### 5. Analytics Preservation

Current tracking: `usePageViewTracking("actor_death", actorId, path)` fires on `ActorDeathPage` mount.

Replacement options (proposal-specific):
- **Proposal A**: Intersection Observer on death section triggers virtual pageview
- **Proposal B**: Tab switch to "Death Details" triggers virtual pageview
- **Proposal C**: Expand action triggers virtual pageview

## Key Files Referenced

| File | Lines | Role |
|------|-------|------|
| `src/pages/ActorPage.tsx` | 485 | Main page to modify |
| `src/pages/ActorDeathPage.tsx` | 420 | Source of death detail sub-components |
| `src/components/death/LinkedText.tsx` | ~90 | Entity-linked narrative text renderer |
| `src/components/common/ConfidenceIndicator.tsx` | ~40 | Confidence dots/badge |
| `src/components/admin/ui/AdminTabs.tsx` | ~100 | Tab pattern to adapt (Proposal B) |
| `src/components/movie/DeceasedCard.tsx` | ~200 | Expand/collapse pattern (Proposal C) |
| `server/src/routes/actor.ts` | ~250 | Actor profile API handler |
| `server/src/routes/death-details.ts` | ~300 | Death details API handler |
| `server/src/routes/sitemap.ts` | ~200 | Sitemap generation |
| `src/App.tsx` | ~400 | Route definitions (lines 357-358) |
| `src/hooks/useDeathDetails.ts` | 25 | Death details data hook |
| `src/hooks/useActor.ts` | 10 | Actor profile data hook |
| `src/hooks/usePageViewTracking.ts` | ~30 | Analytics page view hook |
| `src/types/death.ts` | 283 | Death details type definitions |
