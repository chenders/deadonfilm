# Proposal C: The Progressive Story

> **Back to [overview](./README.md)**

## Philosophy

Keep the current actor page layout almost exactly as-is, but replace the "View Full Death Details" button with an expandable death summary section placed between the header and biography. When collapsed, it shows a teaser: cause of death, age at death, location, and a one-sentence summary. When expanded, it reveals the full death narrative, sources, career context, and related celebrities -- the same content currently on the `/death` page.

This is the "accordion FAQ" approach: the page is compact by default, and users who want more depth expand the section they care about. It adapts the existing `DeceasedCard` expand/collapse pattern already used in movie pages.

## Design Rationale

- **Minimal disruption**: The current `ActorPage` layout stays nearly identical. The only visible change is the new expandable section replacing the "View Full Death Details" button.
- **Progressive disclosure**: Users who visit for filmography data get a compact page. Users interested in death circumstances expand to get the full story. Both needs are served without overloading either audience.
- **Familiar pattern**: The `DeceasedCard` component already teaches users that clicking a card reveals more detail. This proposal extends that pattern to the death summary.
- **Lightest initial load**: No additional API call on page load. Death details only fetch when the user actively expands the section.

## Section-by-Section Layout

### Desktop (max-w-3xl) -- Collapsed State (Default)

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
│ ┌─────────────────────────────────┐ │
│ │ ▶ Death Circumstances           │ │  ← Collapsed teaser card
│ │                                 │ │
│ │ Died of stomach cancer at age   │ │
│ │ 72 in Los Angeles, CA.          │ │
│ │ Died 4.2 years before life      │ │
│ │ expectancy.                     │ │
│ │                                 │ │
│ │         Read full story ▼       │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Biography                           │
│ Prose biography...                  │
├─────────────────────────────────────┤
│ Analyzed Filmography (42 movies)    │
│ [filmography cards...]              │
├─────────────────────────────────────┤
│ Also died of Stomach Cancer         │
│ [related actor cards...]            │
├─────────────────────────────────────┤
│ See Also: Deaths by Cause | ...     │
└─────────────────────────────────────┘
```

### Desktop -- Expanded State

```
┌─────────────────────────────────────┐
│ Breadcrumb / Header (same as above) │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ▼ Death Circumstances           │ │  ← Expanded card
│ │                                 │ │
│ │ ⚠ Unverified Information        │ │  ← LowConfidenceWarning
│ │                                 │ │
│ │ What We Know                    │ │
│ │ Prose narrative with            │ │
│ │ entity-linked text...           │ │
│ │ [Confidence dots] [Sources]     │ │
│ │                                 │ │
│ │ Alternative Accounts            │ │
│ │ Prose narrative...              │ │
│ │ [Sources]                       │ │
│ │                                 │ │
│ │ Additional Context              │ │
│ │ Prose narrative...              │ │
│ │                                 │ │
│ │ Career Context                  │ │
│ │ Status: Active                  │ │
│ │ Last Project: The Shootist      │ │
│ │ Posthumous: [list]              │ │
│ │                                 │ │
│ │ Related People                  │ │
│ │ ┌────────┐ ┌────────┐          │ │
│ │ │ Name   │ │ Name   │          │ │
│ │ └────────┘ └────────┘          │ │
│ │                                 │ │
│ │ Sources                         │ │
│ │ Cause of Death: [links]         │ │
│ │                                 │ │
│ │       Collapse ▲                │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Biography                           │
│ [rest of page unchanged...]         │
```

### Mobile (< 640px)

- Teaser card is full-width with slightly reduced padding
- Expanded state scrolls naturally; "Collapse" button stays at bottom of expanded section
- Related People grid within expanded section becomes single-column
- The collapse/expand button is large enough for thumb targets (min 44px height)

## Teaser Content Strategy

The teaser shown in collapsed state must be compelling enough to encourage expansion while providing standalone value for users who don't expand.

### Teaser construction

```typescript
function buildTeaser(deathInfo: ActorDeathInfo): string {
  const parts: string[] = []

  // Cause of death
  if (deathInfo.causeOfDeath) {
    parts.push(`Died of ${deathInfo.causeOfDeath.toLowerCase()}`)
  }

  // Age at death
  if (deathInfo.ageAtDeath) {
    parts.push(`at age ${deathInfo.ageAtDeath}`)
  }

  // Location (from death details API, if already in actor response)
  // Note: location is only in DeathDetailsResponse.circumstances.locationOfDeath
  // For the teaser, we use causeOfDeathDetails (the short summary) instead

  return parts.join(" ") + "."
}
```

The teaser uses `deathInfo.causeOfDeathDetails` from the actor profile API (already available without a second API call). This is the short 1-2 sentence summary already shown in the `HoverTooltip` on the current page.

### Teaser data source: No extra API call needed

The `ActorProfileResponse.deathInfo` already includes:
- `causeOfDeath` (e.g., "stomach cancer")
- `causeOfDeathDetails` (e.g., "Wayne died on June 11, 1979, at UCLA Medical Center...")
- `ageAtDeath` (e.g., 72)
- `yearsLost` (e.g., "4.2")
- `hasDetailedDeathInfo` (boolean -- controls whether "Read full story" appears)

## Information Architecture

| Section | Visibility | Source |
|---------|-----------|--------|
| Header (photo, dates, cause) | Always | `useActor` |
| Death teaser (collapsed) | Always for deceased with details | `useActor` (deathInfo) |
| Low Confidence Warning | On expand | `useActorDeathDetails` |
| What We Know (narrative) | On expand | `useActorDeathDetails` |
| Alternative Accounts | On expand | `useActorDeathDetails` |
| Additional Context | On expand | `useActorDeathDetails` |
| Career Context | On expand | `useActorDeathDetails` |
| Related People (death) | On expand | `useActorDeathDetails` |
| Sources | On expand | `useActorDeathDetails` |
| Biography | Always | `useActor` |
| Filmography | Always | `useActor` |
| Related Actors (cause) | Always | `useRelatedActors` |
| See Also links | Always | Static |

## Actor State Handling

### Deceased with death details (`hasDetailedDeathInfo === true`)

Shows the expandable death teaser card between header and biography. Collapsed by default. "Read full story" button triggers expansion and lazy-loads death details.

### Deceased without death details

Shows a non-expandable death summary card between header and biography. Displays cause of death and `causeOfDeathDetails` (the short summary). No "Read full story" button. No expand/collapse.

### Living actor

No death card shown. Page renders identically to the current `ActorPage`: header, biography, filmography, related actors.

## Component Plan

### New Component: `DeathSummaryCard`

```typescript
// src/components/death/DeathSummaryCard.tsx
interface DeathSummaryCardProps {
  // Teaser data (from useActor / ActorProfileResponse.deathInfo)
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
  yearsLost: number | null

  // Expandable behavior
  hasFullDetails: boolean  // Controls whether expand button shows
  slug: string             // For lazy-loading death details (full narrative, factors, sources)

  // Analytics
  onExpand?: () => void    // Fires virtual pageview
  onCollapse?: () => void
}
```

Note: `notableFactors` are NOT available in `ActorProfileResponse.deathInfo` -- they come
from `DeathDetailsResponse.circumstances.notableFactors`. Factor badges will only appear
in the expanded state, rendered by `DeathDetailsContent` after the lazy fetch completes.

Internally manages:
- `isExpanded` boolean state
- Lazy-loads `useActorDeathDetails(slug)` when first expanded
- Shows loading skeleton during fetch
- Caches expanded data in React Query (subsequent expand/collapse is instant)

### Expand/Collapse Pattern (Adapted from `DeceasedCard`)

The existing `DeceasedCard` uses:
```typescript
const [isExpanded, setIsExpanded] = useState(false)
// <button aria-expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>
// {isExpanded && <div data-testid="actor-expanded">...</div>}
```

`DeathSummaryCard` follows the same pattern but with:
- Richer collapsed state (teaser paragraph + factor badges, not just a name)
- Lazy data fetching on first expand
- Loading skeleton during fetch
- Smooth height animation (optional, using CSS `max-height` transition or `framer-motion`)

### Component Extraction (Same as All Proposals)

Extract `LowConfidenceWarning`, `FactorBadge`, `ProjectLink`, `SourceList`, `RelatedCelebrityCard` from `ActorDeathPage.tsx` into `src/components/death/`.

### New Component: `DeathDetailsContent`

The expanded content inside `DeathSummaryCard`, extracted for testability:

```typescript
// src/components/death/DeathDetailsContent.tsx
interface DeathDetailsContentProps {
  data: DeathDetailsResponse
}
```

Renders: LowConfidenceWarning, What We Know, Alternative Accounts, Additional Context, Career Context, Related People, Sources. Same sections as the current `ActorDeathPage` body, minus the header.

## API / Data Strategy

### Approach: Lazy-load on expand

```typescript
// Inside DeathSummaryCard
const [isExpanded, setIsExpanded] = useState(false)
const [hasEverExpanded, setHasEverExpanded] = useState(false)

const handleToggle = () => {
  if (!isExpanded && !hasEverExpanded) {
    setHasEverExpanded(true)
    props.onExpand?.()  // Fire analytics on first expansion
  }
  setIsExpanded(!isExpanded)
}

// In JSX: Only mount the details panel (and run the query) when expanded.
// DeathDetailsContent internally calls useActorDeathDetails(slug).
// Note: useActorDeathDetails only accepts slug: string -- no enabled option.
// Conditional mounting achieves the same lazy-load behavior.
{isExpanded && (
  <DeathDetailsContent slug={slug} />
)}
```

- No API call on page load (identical performance to today)
- First expand mounts `DeathDetailsContent`, which triggers the fetch; loading skeleton shown for ~200-500ms
- React Query caches the result; subsequent collapse/expand is instant (component remounts but data is cached)
- If the user never expands, no bandwidth is wasted

### Optional: Prefetch on hover

```typescript
const queryClient = useQueryClient()

const handleMouseEnter = () => {
  if (!hasEverExpanded) {
    queryClient.prefetchQuery({
      queryKey: ["actor-death-details", slug],
      queryFn: () => getActorDeathDetails(slug),
    })
  }
}
```

## SEO Migration Plan

### 301 Redirects

```
# nginx.conf - Server-side redirect (non-API routes are served by nginx)
location ~ ^/actor/(.+)/death$ {
  return 301 /actor/$1;
}

// Client-side
<Route
  path="/actor/:slug/death"
  element={<Navigate to={`/actor/${slug}`} replace />}
/>
```

### SEO for Death Content

The teaser text (`causeOfDeathDetails`) is always in the DOM, giving search engines some death-related content to index. The full narrative is lazy-loaded on expand and won't be indexed by crawlers that don't execute JS interactions.

**Mitigations:**
1. **Structured data**: Include full death information in JSON-LD Person schema
2. **Meta description**: Already includes cause of death
3. **Teaser as summary**: The teaser paragraph provides the most important death facts (cause, age, location) in the initial DOM

### Sitemap

- Remove `sitemap-death-details.xml`
- Actor sitemap unchanged

### Canonical URLs

- Single canonical: `/actor/:slug`

## Implementation Steps

### Phase 1: Component Extraction

1. Create `src/components/death/LowConfidenceWarning.tsx`
2. Create `src/components/death/FactorBadge.tsx`
3. Create `src/components/death/ProjectLink.tsx`
4. Create `src/components/death/SourceList.tsx`
5. Create `src/components/death/RelatedCelebrityCard.tsx`
6. Update `ActorDeathPage.tsx` to import from new locations
7. Write tests for each extracted component

### Phase 2: Build `DeathDetailsContent`

8. Create `src/components/death/DeathDetailsContent.tsx` (renders all death sections given data)
9. Write tests (render with full data, partial data, empty sections)

### Phase 3: Build `DeathSummaryCard`

10. Create `src/components/death/DeathSummaryCard.tsx` with:
    - Collapsed teaser view
    - Expand/collapse toggle with `aria-expanded`
    - Lazy-loads death details on first expand
    - Loading skeleton during fetch
    - Renders `DeathDetailsContent` when expanded
    - Analytics callback on expand
11. Write tests:
    - Renders teaser when collapsed
    - Expand fetches data and renders details
    - Collapse hides details but retains data
    - Analytics callback fires on first expand only
    - Loading state during fetch
    - Non-expandable variant (no full details)

### Phase 4: Integrate into `ActorPage`

12. Add `<DeathSummaryCard>` between header and biography in `ActorPage.tsx`
13. Pass teaser data from `useActor` response's `deathInfo`
14. Wire `onExpand` to fire virtual pageview: `usePageViewTracking("actor_death", ...)`
15. Remove "View Full Death Details" button from header external links
16. Remove death details `HoverTooltip` "Read more" link
17. Conditionally render `DeathSummaryCard` only for deceased actors

### Phase 5: Route & SEO Migration

18. Replace `ActorDeathPage` route with redirect
19. Add server-side 301 redirect
20. Remove death-details sitemap
21. Update internal links
22. Add death fields to Person JSON-LD schema

### Phase 6: Cleanup

23. Delete `src/pages/ActorDeathPage.tsx`
24. Remove unused imports
25. Verify all internal links

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ActorPage.tsx` | Add `DeathSummaryCard`, remove death details button/tooltip link |
| `src/pages/ActorDeathPage.tsx` | Delete after migration |
| `src/App.tsx` | Replace death page route with redirect |
| `src/components/death/DeathSummaryCard.tsx` | **New file** -- expandable death teaser |
| `src/components/death/DeathDetailsContent.tsx` | **New file** -- expanded death sections |
| `src/components/death/LowConfidenceWarning.tsx` | **New file** |
| `src/components/death/FactorBadge.tsx` | **New file** |
| `src/components/death/ProjectLink.tsx` | **New file** |
| `src/components/death/SourceList.tsx` | **New file** |
| `src/components/death/RelatedCelebrityCard.tsx` | **New file** |
| `nginx.conf` | Add 301 redirect for `/actor/:slug/death` |
| `server/src/routes/sitemap.ts` | Remove death-details sitemap |
| `src/utils/schema.ts` | Add death fields to Person schema |

## Verification / Testing

### Unit Tests

- `DeathSummaryCard`: collapsed render, expand triggers fetch, loading state, expanded render, collapse retains data, analytics callback, non-expandable variant
- `DeathDetailsContent`: render all sections, partial data, empty sections
- `ActorPage` integration: shows card for deceased with details, non-expandable card for deceased without details, no card for living

### Manual Testing

- Navigate to `/actor/john-wayne-2157` -- teaser card visible, collapsed
- Click "Read full story" -- loading skeleton, then full death narrative expands
- Click "Collapse" -- content hides, teaser remains
- Re-expand -- instant (no loading, data cached)
- Navigate to `/actor/john-wayne-2157/death` -- 301 redirects to `/actor/john-wayne-2157`
- Check GA4 for `actor_death` events on expand
- Navigate to a living actor -- no death card shown
- Navigate to deceased actor without details -- non-expandable summary card
- Test on mobile (375px): teaser card readable, expand/collapse touch targets adequate

### Performance

- Initial page load: identical to current actor page (no extra API call)
- Expand latency: measure time from click to content render (target <500ms)
- No LCP regression

### Accessibility

- Expand/collapse button has `aria-expanded` attribute
- Expanded content is in tab order
- Screen readers announce state change
- Keyboard: Enter/Space toggles expand/collapse

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Death content views per actor page view | ~15% click-through | >30% expand rate | Virtual pageview events / actor page views |
| Initial page load (LCP) | Baseline | No regression | Web Vitals tracking |
| Expand-to-read rate | N/A | >70% of expanders scroll past first section | Scroll depth within expanded card |
| Teaser-to-expand ratio | N/A | >25% of users who see teaser expand it | Expand events / actor page views for deceased actors |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Teaser not compelling enough to drive expansion | A/B test teaser copy. Consider adding a provocative hook: "Died under mysterious circumstances" for strange deaths |
| Long expanded content pushes filmography too far down | Add a "Jump to Filmography" link at the bottom of expanded content. Or place filmography *above* the death card for non-death-focused users |
| Expand state lost on page navigation | Consider persisting expand state in sessionStorage keyed by actor slug. Or accept the trade-off: collapsed is a safe default |
| Accessibility: screen readers might not announce expanded content well | Use `aria-expanded`, `aria-controls`, and `role="region"` to ensure proper announcement |
