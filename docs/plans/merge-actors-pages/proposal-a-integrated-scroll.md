# Proposal A: The Integrated Scroll

> **Back to [overview](./README.md)**

## Philosophy

One actor, one page, one scroll. All information about an actor -- biography, death circumstances, filmography, related people -- lives on a single continuous page. No tabs, no expand buttons, no second click. The page loads both API payloads in parallel and renders everything immediately.

This is the "newspaper article" approach: the most important information (who died, how, when) is at the top, with progressively less critical content (filmography, related actors) further down.

## Design Rationale

- **F-pattern scanning**: Users scan the header, then read the death narrative, then skim filmography cards. This matches natural reading behavior.
- **Zero-click death content**: The primary motivation for the merge is eliminating the click to reach death details. This proposal eliminates *all* clicks.
- **SEO maximization**: All content is in the initial DOM, fully indexable by search engines.
- **Simplicity**: No state management for tabs or expansion. Just a long page.

## Section-by-Section Layout

### Desktop (max-w-3xl, ~768px content width)

```
┌─────────────────────────────────────┐
│ Breadcrumb: Home > Actor Name       │
│ [Admin Toolbar - if admin]          │
├─────────────────────────────────────┤
│ ┌──────┐  Actor Name (Deceased)     │
│ │Photo │  Born: Jan 1, 1920         │
│ │144x  │  Died: Jun 11, 1979 (59)   │
│ │192   │  Cause: Stomach Cancer      │
│ └──────┘  [TMDB] [Wikipedia]        │
├─────────────────────────────────────┤
│ ⚠ Unverified Information (if low)   │  ← LowConfidenceWarning
├─────────────────────────────────────┤
│ What We Know                        │  ← Death narrative with LinkedText
│ Prose narrative about death...      │
│ [Confidence dots] [Sources]         │
├─────────────────────────────────────┤
│ Alternative Accounts (if any)       │  ← Rumored circumstances
│ Prose narrative...                  │
│ [Sources]                           │
├─────────────────────────────────────┤
│ Additional Context (if any)         │
│ Prose narrative...                  │
├─────────────────────────────────────┤
│ Career Context                      │  ← Status at death, last project
│ Status at Death: Active             │
│ Last Project: The Shootist (1976)   │
│ Posthumous: [list]                  │
├─────────────────────────────────────┤
│ Biography                           │  ← From TMDB/Wikipedia
│ Prose biography...                  │
│ Read more on Wikipedia →            │
├─────────────────────────────────────┤
│ Analyzed Filmography (42 movies)    │  ← Filmography cards
│ ┌─────────────────────────────────┐ │
│ │ [poster] Title  Year    12/45   │ │
│ │          as Character   27%     │ │
│ └─────────────────────────────────┘ │
│ ... more cards ...                  │
├─────────────────────────────────────┤
│ Related People                      │  ← From death details
│ ┌──────────┐ ┌──────────┐          │
│ │ Name     │ │ Name     │          │
│ │ Relation │ │ Relation │          │
│ └──────────┘ └──────────┘          │
├─────────────────────────────────────┤
│ Also died of Stomach Cancer         │  ← From related actors hook
│ [actor cards...]                    │
├─────────────────────────────────────┤
│ Sources                             │  ← Aggregated sources
│ Cause of Death: [links]             │
│ Circumstances: [links]              │
├─────────────────────────────────────┤
│ See Also: Deaths by Cause | ...     │
└─────────────────────────────────────┘
```

### Mobile (< 640px)

Same section order, but:
- Photo stacks above name (centered), existing `flex-col items-center` pattern
- Filmography cards become full-width
- Related People grid becomes single column
- Death narrative sections get reduced padding (`p-4` instead of `p-4 sm:p-6`)

## Information Architecture

| Section | Visible by Default | Source |
|---------|--------------------|--------|
| Header (photo, dates, cause) | Yes | `useActor` |
| Low Confidence Warning | Yes (if applicable) | `useActorDeathDetails` |
| What We Know (narrative) | Yes | `useActorDeathDetails` |
| Alternative Accounts | Yes (if exists) | `useActorDeathDetails` |
| Additional Context | Yes (if exists) | `useActorDeathDetails` |
| Career Context | Yes (if exists) | `useActorDeathDetails` |
| Biography | Yes | `useActor` |
| Filmography | Yes | `useActor` |
| Related People (death) | Yes (if exists) | `useActorDeathDetails` |
| Related Actors (cause) | Yes (if exists) | `useRelatedActors` |
| Sources | Yes | `useActorDeathDetails` |
| See Also links | Yes | Static |

## Actor State Handling

### Deceased with death details (`hasDetailedDeathInfo === true`)

Full page as described above. Both API calls fire in parallel. Death sections render between header and biography.

### Deceased without death details

Page renders: Header (with cause of death from `deathInfo` if available) → Biography → Filmography → Related Actors → See Also. No death narrative sections. No second API call.

### Living actor

Page renders: Header (no "Deceased" label, shows current age) → Biography → Filmography → Related Actors. No death sections, no See Also links. Identical to current `ActorPage` behavior.

## Component Extraction Plan

Extract from `ActorDeathPage.tsx` into shared components:

| Component | New File | Used By |
|-----------|----------|---------|
| `LowConfidenceWarning` | `src/components/death/LowConfidenceWarning.tsx` | `ActorPage` death section |
| `FactorBadge` | `src/components/death/FactorBadge.tsx` | `ActorPage` header |
| `ProjectLink` | `src/components/death/ProjectLink.tsx` | `ActorPage` career section |
| `SourceList` | `src/components/death/SourceList.tsx` | `ActorPage` sources section |
| `RelatedCelebrityCard` | `src/components/death/RelatedCelebrityCard.tsx` | `ActorPage` related section |

Already extracted: `LinkedText`, `ConfidenceIndicator`

### New Component: `DeathDetailsSection`

Create `src/components/death/DeathDetailsSection.tsx` to encapsulate the entire death narrative block (What We Know + Alternative Accounts + Additional Context + Career Context + Sources). This keeps `ActorPage` from becoming 800+ lines.

```typescript
interface DeathDetailsSectionProps {
  data: DeathDetailsResponse
  onVisible?: () => void  // Intersection Observer callback for analytics
}
```

## API / Data Strategy

### Approach: Parallel fetch on load

```typescript
// In ActorPage.tsx
const { data: actorData, isLoading: actorLoading } = useActor(slug)
const { data: deathData, isLoading: deathLoading } = useActorDeathDetails(
  slug,
  { enabled: actorData?.deathInfo?.hasDetailedDeathInfo === true }
)
```

- `useActor` fires immediately (same as today)
- `useActorDeathDetails` fires after `useActor` resolves, only if the actor has detailed death info
- Page renders header + biography + filmography immediately; death sections render when death data arrives
- Skeleton/loading placeholder shown in death section while loading

### Alternative considered: Merged API endpoint

A single `/api/actor/:slug?include=death` endpoint could return both payloads. This was rejected because:
- Adds complexity to the actor API handler
- Breaks existing caching (actor cache TTL vs. death details cache TTL may differ)
- The sequential approach above adds minimal latency (death details fetch starts ~50ms after actor data arrives)

## SEO Migration Plan

### 301 Redirects

```typescript
// src/App.tsx - Replace ActorDeathPage route
<Route
  path="/actor/:slug/death"
  element={<Navigate to={`/actor/${slug}`} replace />}
/>

// server/src/routes/actor.ts - Server-side redirect
router.get("/actor/:slug/death", (req, res) => {
  res.redirect(301, `/actor/${req.params.slug}`)
})
```

### Sitemap

- Remove `sitemap-death-details.xml` from index
- Remove `getDeathDetailsSitemap()` handler
- Actor sitemap already includes `/actor/:slug` URLs -- no changes needed

### Canonical URLs

- `ActorPage` already sets `<link rel="canonical">` to `/actor/:slug`
- Remove the canonical from `ActorDeathPage` (page no longer exists)

### Structured Data

- Merge death-related JSON-LD into `ActorPage`'s existing `buildPersonSchema` call
- Add `deathDate` and `deathPlace` fields to Person schema when available

## Implementation Steps

### Phase 1: Component Extraction (no user-facing changes)

1. Create `src/components/death/LowConfidenceWarning.tsx` -- extract from `ActorDeathPage.tsx:19-57`
2. Create `src/components/death/FactorBadge.tsx` -- extract from `ActorDeathPage.tsx:60-74`
3. Create `src/components/death/ProjectLink.tsx` -- extract from `ActorDeathPage.tsx:77-116`
4. Create `src/components/death/SourceList.tsx` -- extract from `ActorDeathPage.tsx:119-146`
5. Create `src/components/death/RelatedCelebrityCard.tsx` -- extract from `ActorDeathPage.tsx:149-170`
6. Update `ActorDeathPage.tsx` to import from new locations (verify no regressions)
7. Write tests for each extracted component

### Phase 2: Build `DeathDetailsSection`

8. Create `src/components/death/DeathDetailsSection.tsx` composing all death sub-components
9. Add `onVisible` prop wired to Intersection Observer for analytics
10. Write tests for `DeathDetailsSection` (snapshot + interaction tests)

### Phase 3: Integrate into `ActorPage`

11. Add `useActorDeathDetails` hook call to `ActorPage.tsx` (conditional on `hasDetailedDeathInfo`)
12. Insert `<DeathDetailsSection>` between header and biography sections
13. Wire Intersection Observer to fire `usePageViewTracking("actor_death", ...)` when death section scrolls into view
14. Remove "View Full Death Details" button from header
15. Remove death details tooltip "Read more" link from `HoverTooltip` content
16. Update Helmet meta description to include death narrative summary

### Phase 4: Route & SEO Migration

17. Replace `ActorDeathPage` route in `App.tsx` with `<Navigate>` redirect
18. Add server-side 301 redirect for `/actor/:slug/death`
19. Remove `sitemap-death-details.xml` from sitemap index
20. Remove `getDeathDetailsSitemap()` handler from `server/src/routes/sitemap.ts`
21. Update internal links in `NotableDeathsPage` and admin pages
22. Update `buildPersonSchema` to include death-related structured data

### Phase 5: Cleanup

23. Delete `src/pages/ActorDeathPage.tsx` (or keep as redirect stub)
24. Remove unused imports from `App.tsx`
25. Verify all internal links point to `/actor/:slug` (not `/actor/:slug/death`)

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ActorPage.tsx` | Add death details section, remove "View Full Death Details" button |
| `src/pages/ActorDeathPage.tsx` | Eventually delete; initially update imports |
| `src/App.tsx` | Replace death page route with redirect |
| `src/components/death/LowConfidenceWarning.tsx` | **New file** |
| `src/components/death/FactorBadge.tsx` | **New file** |
| `src/components/death/ProjectLink.tsx` | **New file** |
| `src/components/death/SourceList.tsx` | **New file** |
| `src/components/death/RelatedCelebrityCard.tsx` | **New file** |
| `src/components/death/DeathDetailsSection.tsx` | **New file** |
| `server/src/routes/actor.ts` | Add 301 redirect for `/death` suffix |
| `server/src/routes/sitemap.ts` | Remove death-details sitemap |
| `src/utils/schema.ts` | Add death fields to Person schema |

## Verification / Testing

### Unit Tests

- Each extracted component: render with valid data, render with null/empty data, test interactive elements
- `DeathDetailsSection`: render all sub-sections, render with partial data, Intersection Observer fires analytics
- `ActorPage` integration: renders death section for deceased actor with details, omits for living actor, omits for deceased without details

### Manual Testing

- Navigate to `/actor/john-wayne-2157` -- death details should appear inline
- Navigate to `/actor/john-wayne-2157/death` -- should 301 redirect to `/actor/john-wayne-2157`
- Check GA4 for `actor_death` events firing via Intersection Observer
- Verify structured data with Google Rich Results Test
- Check `/sitemap.xml` no longer lists `sitemap-death-details.xml`
- Test on mobile viewport (375px width) for scroll behavior

### Performance

- Lighthouse audit before/after: watch for LCP regression from loading both payloads
- Check that death details API call doesn't block initial render (should show skeleton while loading)

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Death content views per actor page view | ~15% click-through | >50% scroll-to | Intersection Observer events / actor page views |
| Time on actor page | Baseline | +30% | GA4 engagement time |
| Bounce rate on actor pages | Baseline | -10% | GA4 bounce rate |
| Core Web Vitals (LCP) | Baseline | No regression >200ms | Web Vitals tracking |
