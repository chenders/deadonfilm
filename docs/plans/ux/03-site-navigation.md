# 03: Add Persistent Site Navigation

**Priority:** #3 (High)
**Confidence:** 9/10
**Effort:** Medium (3-5 days)
**Dependencies:** None

## Problem

Once a user navigates away from the home page, the only way to discover new content is through the search modal (Cmd+K or clicking the search icon). The Header contains only: logo, theme toggle, and search trigger. There are no navigation links, no browse section, and no way to reach content categories without knowing the exact URL.

The Footer currently shows only TMDB attribution -- a missed opportunity for section links.

## Solution

### UX Design: Header Navigation

**Desktop (>=768px):** Horizontal text links between logo and controls.

```
┌─────────────────────────────────────────────────────┐
│  💀 Dead on Film    Deaths  Genres  Causes    🔍 🌙 │
└─────────────────────────────────────────────────────┘
```

**Mobile (<768px):** Hamburger menu icon that opens a slide-out panel.

```
┌──────────────────────┐
│  💀 Dead on Film  ☰  │    ← hamburger replaces inline links
└──────────────────────┘
     ┌─────────────┐
     │ Deaths       │    ← slide-out panel
     │ Genres       │
     │ Causes       │
     │ ─────────── │
     │ Death Watch  │
     │ Forever Young│
     │ About        │
     └─────────────┘
```

### Navigation Items

| Label | URL | Description |
|-------|-----|-------------|
| Deaths | `/deaths` | Deaths hub page |
| Genres | `/genres` | Genre index |
| Causes | `/causes-of-death` | Causes of death index |

**Mobile-only additional items** (in hamburger menu):

| Label | URL | Description |
|-------|-----|-------------|
| Death Watch | `/death-watch` | Predicted next deaths |
| Forever Young | `/forever-young` | Actors who died young |

### UX Design: Footer Enhancement

Add section links above the existing TMDB attribution:

```
┌─────────────────────────────────────────────────────┐
│  Browse                    Features                  │
│  Deaths by Decade          Death Watch               │
│  Notable Deaths            Forever Young              │
│  Causes of Death           COVID-19 Deaths           │
│  Genres                    Unnatural Deaths           │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  TMDB attribution · © Dead on Film                   │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation

### Header Changes

**File:** `src/components/layout/Header.tsx`

The header currently uses a 3-column grid: spacer | logo+title | controls.

Add a nav element between the logo area and controls:

```tsx
<nav className="hidden md:flex items-center gap-6">
  <NavLink to="/deaths">Deaths</NavLink>
  <NavLink to="/genres">Genres</NavLink>
  <NavLink to="/causes-of-death">Causes</NavLink>
</nav>
```

For mobile, add a hamburger button that toggles a slide-out panel:

```tsx
// Mobile menu button (shown only on small screens)
<button className="md:hidden" onClick={toggleMenu} aria-label="Open menu">
  <HamburgerIcon />
</button>

// Slide-out panel (conditionally rendered)
{isMenuOpen && (
  <MobileMenu onClose={closeMenu} />
)}
```

### Footer Changes

**File:** `src/components/layout/Footer.tsx`

Add a two-column link section above the existing TMDB attribution:

```tsx
<footer className="bg-cream/50 border-t border-brown-medium/20">
  {/* New: Section links */}
  <div className="grid grid-cols-2 gap-8 px-4 py-8 max-w-4xl mx-auto">
    <div>
      <h3 className="font-semibold text-brown-dark mb-3">Browse</h3>
      <ul className="space-y-2">
        <li><Link to="/deaths/decades">Deaths by Decade</Link></li>
        <li><Link to="/deaths/notable">Notable Deaths</Link></li>
        <li><Link to="/causes-of-death">Causes of Death</Link></li>
        <li><Link to="/genres">Genres</Link></li>
      </ul>
    </div>
    <div>
      <h3 className="font-semibold text-brown-dark mb-3">Features</h3>
      <ul className="space-y-2">
        <li><Link to="/death-watch">Death Watch</Link></li>
        <li><Link to="/forever-young">Forever Young</Link></li>
        <li><Link to="/deaths/covid">COVID-19 Deaths</Link></li>
        <li><Link to="/deaths/unnatural">Unnatural Deaths</Link></li>
      </ul>
    </div>
  </div>

  {/* Existing: TMDB attribution */}
  ...
</footer>
```

### New Component: MobileMenu

**File:** `src/components/layout/MobileMenu.tsx` (new)

Slide-out overlay panel for mobile navigation:

- Overlay backdrop (click to close)
- Slide-in from right with animation
- Links grouped by section
- Close button (X) at top
- Focus trap for accessibility

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/Header.tsx` | Add desktop nav links + mobile hamburger button |
| `src/components/layout/Footer.tsx` | Add section link columns above TMDB attribution |
| `src/components/layout/MobileMenu.tsx` (new) | Slide-out mobile navigation panel |

## Anti-Patterns

1. **Don't add too many nav items** -- 3 desktop links is the sweet spot. More than 5 clutters the header and competes with search.
2. **Don't duplicate the search bar in navigation** -- Search already has a dedicated trigger. Nav links are for browsing, not searching.
3. **Don't use a mega-menu** -- The site's content hierarchy isn't deep enough to warrant one. Simple links suffice.
4. **Don't hide all navigation behind a hamburger on desktop** -- Desktop users should see primary links without clicking.
5. **Don't add navigation to the home page header** -- The home page is search-focused. Navigation should appear on non-home pages where the search bar isn't inline.
