# Proposal B: The Tabbed Profile

> **Back to [overview](./README.md)**

## Philosophy

Shared header at the top, then a tab bar that organizes content by type. The Overview tab shows biography and filmography (the current actor page experience). The Death Details tab shows the full death narrative, sources, career context, and related celebrities. A Related tab shows cause-based related actors and hub page links.

This is the "Wikipedia article with table of contents" approach: users see basic facts immediately, then choose which section to dive into. Content types don't mix -- data tables stay in one tab, prose narratives in another.

## Design Rationale

- **Content-type separation**: Filmography (compact data cards) and death narratives (long prose) serve different user needs. Tabs let each content type breathe.
- **Familiar pattern**: Tab interfaces are well-understood. The codebase already has `AdminTabs` with full keyboard navigation and ARIA compliance.
- **Lazy loading**: Death details data only loads when the user switches to that tab, keeping the initial page weight identical to today's actor page.
- **Clean analytics boundary**: Tab switch is a clear, intentional action that maps directly to a virtual pageview event.

## Section-by-Section Layout

### Desktop (max-w-3xl)

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
│ [ Overview ]  [ Death Details ]  [ Related ]
│ ─────────────────────────────────── │  ← Tab bar
├─────────────────────────────────────┤
│                                     │
│ TAB CONTENT (varies by active tab)  │
│                                     │
└─────────────────────────────────────┘
```

### Tab: Overview (default)

```
│ Biography                           │
│ Prose biography...                  │
│ Read more on Wikipedia →            │
├─────────────────────────────────────┤
│ Analyzed Filmography (42 movies)    │
│ ┌─────────────────────────────────┐ │
│ │ [poster] Title  Year    12/45   │ │
│ └─────────────────────────────────┘ │
│ ... more cards ...                  │
```

### Tab: Death Details

```
│ ⚠ Unverified Information            │  ← LowConfidenceWarning
├─────────────────────────────────────┤
│ What We Know                        │  ← LinkedText narrative
│ Prose narrative...                  │
│ [Confidence dots] [Sources]         │
├─────────────────────────────────────┤
│ Alternative Accounts                │
│ Prose narrative...                  │
├─────────────────────────────────────┤
│ Additional Context                  │
│ Prose narrative...                  │
├─────────────────────────────────────┤
│ Career Context                      │
│ Status: Active                      │
│ Last Project: The Shootist (1976)   │
│ Posthumous: [list]                  │
├─────────────────────────────────────┤
│ Related People                      │
│ ┌──────────┐ ┌──────────┐          │
│ │ Name     │ │ Name     │          │
│ │ Relation │ │ Relation │          │
│ └──────────┘ └──────────┘          │
├─────────────────────────────────────┤
│ Sources                             │
│ Cause of Death: [links]             │
│ Circumstances: [links]              │
```

### Tab: Related

```
│ Also died of Stomach Cancer         │
│ [actor cards with photos...]        │
├─────────────────────────────────────┤
│ See Also                            │
│ Deaths by Cause | Forever Young |   │
│ Death Watch                         │
```

### Mobile (< 640px)

- Tab bar becomes horizontally scrollable if labels are long
- Tab labels can abbreviate: "Overview" | "Death" | "Related"
- Photo stacks above name (existing responsive behavior)
- All tab content renders full-width

## Tab Configuration

### Tab definitions by actor state

**Deceased with death details:**
```typescript
const tabs: TabDefinition[] = [
  { id: "overview", label: "Overview" },
  { id: "death", label: "Death Details" },
  { id: "related", label: "Related" },
]
```

**Deceased without death details:**
```typescript
const tabs: TabDefinition[] = [
  { id: "overview", label: "Overview" },
  // No death tab
  { id: "related", label: "Related" },
]
```

**Living actor:**
```typescript
// No tabs at all -- renders like the current ActorPage
// (or optionally: Overview + Related if related actors exist)
```

### URL Hash Sync

Active tab syncs with URL hash for deep-linking and back-button support:

```
/actor/john-wayne-2157           → Overview tab (default)
/actor/john-wayne-2157#death     → Death Details tab
/actor/john-wayne-2157#related   → Related tab
```

The old URL `/actor/john-wayne-2157/death` 301-redirects to `/actor/john-wayne-2157#death`.

## Information Architecture

| Section | Tab | Visible by Default | Source |
|---------|-----|--------------------|--------|
| Header (photo, dates, cause) | All | Yes | `useActor` |
| Biography | Overview | Yes (default tab) | `useActor` |
| Filmography | Overview | Yes (default tab) | `useActor` |
| Low Confidence Warning | Death Details | On tab switch | `useActorDeathDetails` |
| What We Know | Death Details | On tab switch | `useActorDeathDetails` |
| Alternative Accounts | Death Details | On tab switch | `useActorDeathDetails` |
| Additional Context | Death Details | On tab switch | `useActorDeathDetails` |
| Career Context | Death Details | On tab switch | `useActorDeathDetails` |
| Related People (death) | Death Details | On tab switch | `useActorDeathDetails` |
| Sources | Death Details | On tab switch | `useActorDeathDetails` |
| Related Actors (cause) | Related | On tab switch | `useRelatedActors` |
| See Also links | Related | On tab switch | Static |

## Actor State Handling

### Deceased with death details

Full tabbed interface: Overview (default) | Death Details | Related. Header shows cause of death and "Died X years before life expectancy" line. Death Details tab lazy-loads on first visit.

### Deceased without death details

Two tabs: Overview | Related. Header shows cause of death if available (from `deathInfo.causeOfDeath`). No Death Details tab.

### Living actor

No tab bar. Page renders identically to the current `ActorPage`: header, biography, filmography, related actors (if any), see also links. The tab bar only appears when there are 2+ tabs to show.

## Component Plan

### Adapt `AdminTabs` for Public Use

The existing `AdminTabs` component already has:
- Keyboard navigation (ArrowLeft/Right, Home, End)
- ARIA compliance (role="tablist", role="tab", role="tabpanel")
- Active state styling
- Badge support

Changes needed to make it work for public pages:
1. Extract the tab logic into a generic `Tabs` component in `src/components/common/Tabs.tsx`
2. `AdminTabs` becomes a thin wrapper with admin-specific styling
3. `ActorTabs` uses the same logic with public-page styling (brown-dark/cream colors instead of admin blue/gray)

```typescript
// src/components/common/Tabs.tsx
interface TabsProps {
  tabs: TabDefinition[]
  activeTab: string
  onTabChange: (tabId: string) => void
  className?: string        // Container styling
  tabClassName?: string     // Individual tab styling
  activeClassName?: string  // Active tab styling
}
```

### Component Extraction (Same as All Proposals)

Extract `LowConfidenceWarning`, `FactorBadge`, `ProjectLink`, `SourceList`, `RelatedCelebrityCard` from `ActorDeathPage.tsx` into `src/components/death/`.

### New Component: `DeathDetailsTab`

```typescript
// src/components/death/DeathDetailsTab.tsx
interface DeathDetailsTabProps {
  slug: string
  onDataLoaded?: () => void  // Analytics: fires virtual pageview when data arrives
}
```

Internally uses `useActorDeathDetails(slug)` and renders all death sub-sections. Shows loading skeleton while fetching.

## API / Data Strategy

### Approach: Lazy-load on tab switch

```typescript
// In ActorPage.tsx
const [activeTab, setActiveTab] = useState(() => {
  const hash = location.hash.replace("#", "")
  return ["overview", "death", "related"].includes(hash) ? hash : "overview"
})

// Death data only fetched when tab is active (or pre-fetched after Overview renders)
// The DeathDetailsTab component internally calls useActorDeathDetails
```

- `useActor` fires on mount (same as today)
- `useActorDeathDetails` fires when user switches to Death Details tab
- React Query caches the result, so switching back and forth doesn't re-fetch

### Optional: Prefetch on hover

```typescript
// Prefetch death details when user hovers over the Death Details tab
const queryClient = useQueryClient()
const prefetchDeathDetails = () => {
  queryClient.prefetchQuery({
    queryKey: ["actor-death-details", slug],
    queryFn: () => getActorDeathDetails(slug),
  })
}
```

This eliminates the loading state when the user actually clicks the tab.

## SEO Migration Plan

### 301 Redirects

```
# nginx.conf - Server-side redirect (non-API routes are served by nginx)
location ~ ^/actor/(.+)/death$ {
  return 301 /actor/$1#death;
}
```

```tsx
// Client-side: React Router redirect
<Route
  path="/actor/:slug/death"
  element={<Navigate to={`/actor/${slug}#death`} replace />}
/>
```

### SEO Concern: Lazy-loaded tab content

Search engine crawlers may not execute JavaScript to switch tabs, meaning death content behind the Death Details tab might not be indexed.

**Mitigations:**
1. **Query parameter fallback**: Hash fragments are not sent to the server in HTTP requests, so SSR based on `#death` is not possible. If server-side tab selection is needed, use a query parameter (e.g., `/actor/john-wayne-2157?tab=death`) which the server can read and pre-render the appropriate tab content.
2. **Structured data**: Include death information in JSON-LD Person schema regardless of active tab. This ensures search engines see death data even without rendering the tab.
3. **Meta description**: Include cause of death in the meta description (already done on the current actor page).
4. **Accept the trade-off**: The actor page URL retains full SEO value. The incremental SEO value of the death narrative text may be small compared to the structured data and meta description.

### Sitemap

- Remove `sitemap-death-details.xml` from index
- Actor sitemap URLs remain unchanged (`/actor/:slug`)
- No hash-fragment URLs in sitemap (hashes are not separate pages per Google's guidelines)

### Canonical URLs

- Single canonical: `/actor/:slug` (no hash)
- This is correct because hash fragments are same-page anchors

## Implementation Steps

### Phase 1: Component Extraction

1. Create `src/components/death/LowConfidenceWarning.tsx`
2. Create `src/components/death/FactorBadge.tsx`
3. Create `src/components/death/ProjectLink.tsx`
4. Create `src/components/death/SourceList.tsx`
5. Create `src/components/death/RelatedCelebrityCard.tsx`
6. Update `ActorDeathPage.tsx` to import from new locations
7. Write tests for each extracted component

### Phase 2: Extract Generic Tabs Component

8. Create `src/components/common/Tabs.tsx` with generic tab logic from `AdminTabs`
9. Refactor `AdminTabs` to wrap generic `Tabs` with admin styling
10. Write tests for `Tabs` component (keyboard navigation, ARIA, active state)
11. Verify admin pages still work correctly

### Phase 3: Build Tab Content Components

12. Create `src/components/death/DeathDetailsTab.tsx` (lazy-loads death data, renders all death sections)
13. Create `src/components/actor/RelatedTab.tsx` (related actors + see also links)
14. Write tests for both tab content components

### Phase 4: Integrate Tabs into `ActorPage`

15. Add tab state management to `ActorPage.tsx` (synced with URL hash)
16. Add `<Tabs>` component after header section
17. Wrap existing biography + filmography in Overview tab panel
18. Add `<DeathDetailsTab>` in Death Details tab panel
19. Add `<RelatedTab>` in Related tab panel
20. Conditionally show tabs only for deceased actors with details (or 2+ tabs)
21. Fire virtual pageview when Death Details tab is activated
22. Remove "View Full Death Details" button from header
23. Remove death details tooltip "Read more" link

### Phase 5: Route & SEO Migration

24. Replace `ActorDeathPage` route with redirect to `#death` hash
25. Add server-side 301 redirect
26. Remove death-details sitemap
27. Update internal links in other pages
28. Add death fields to Person JSON-LD schema

### Phase 6: Cleanup

29. Delete `src/pages/ActorDeathPage.tsx`
30. Remove unused imports
31. Verify all internal links

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ActorPage.tsx` | Add tab bar, reorganize content into tab panels |
| `src/pages/ActorDeathPage.tsx` | Delete after migration |
| `src/App.tsx` | Replace death page route with redirect |
| `src/components/common/Tabs.tsx` | **New file** -- generic tab component |
| `src/components/admin/ui/AdminTabs.tsx` | Refactor to use generic `Tabs` |
| `src/components/death/LowConfidenceWarning.tsx` | **New file** |
| `src/components/death/FactorBadge.tsx` | **New file** |
| `src/components/death/ProjectLink.tsx` | **New file** |
| `src/components/death/SourceList.tsx` | **New file** |
| `src/components/death/RelatedCelebrityCard.tsx` | **New file** |
| `src/components/death/DeathDetailsTab.tsx` | **New file** |
| `src/components/actor/RelatedTab.tsx` | **New file** |
| `nginx.conf` | Add 301 redirect for `/actor/:slug/death` |
| `server/src/routes/sitemap.ts` | Remove death-details sitemap |
| `src/utils/schema.ts` | Add death fields to Person schema |

## Verification / Testing

### Unit Tests

- `Tabs` component: render tabs, keyboard navigation (arrow keys, Home, End), ARIA attributes, active state
- `DeathDetailsTab`: loading state, render with full data, render with partial data, analytics callback
- `RelatedTab`: render with related actors, render empty state
- `ActorPage`: correct tabs shown for each actor state, hash sync, tab switch behavior

### Manual Testing

- Navigate to `/actor/john-wayne-2157` -- Overview tab active, death details not loaded
- Click "Death Details" tab -- loading skeleton, then death narrative appears
- Check URL updates to `#death`
- Press browser back button -- returns to Overview tab
- Navigate to `/actor/john-wayne-2157/death` -- redirects to `/actor/john-wayne-2157#death`, Death Details tab active
- Navigate to living actor page -- no tab bar shown
- Test keyboard navigation: Tab to tab bar, ArrowRight/Left between tabs
- Verify admin pages still work with refactored `AdminTabs`

### Performance

- Verify that Overview tab loads no slower than current actor page (same API call)
- Check that tab switch to Death Details shows content within 200ms (prefetch on hover helps)
- Lighthouse audit: no LCP regression on initial load

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Death content views per actor page view | ~15% click-through | >35% tab switch | Virtual pageview events / actor page views |
| Initial page load (LCP) | Baseline | No regression | Web Vitals tracking |
| Engagement with death tab | N/A | >60% of switchers read >50% | Scroll depth within tab |
| Tab switch abandonment | N/A | <20% | Switch to death tab then leave within 5s |
