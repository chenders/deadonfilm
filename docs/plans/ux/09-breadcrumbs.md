# 09: Add Breadcrumb Navigation

**Priority:** #9 (Medium)
**Confidence:** 7/10
**Effort:** Small (1-2 days)
**Dependencies:** Site Navigation (#03) -- breadcrumbs are more useful when top-level sections exist

## Problem

Detail pages have no breadcrumb navigation despite hierarchies that are 3+ levels deep:

- Causes of Death > Cancer > Lung Cancer
- Deaths > Decades > 2020s
- Genres > Drama
- Shows > Season > Episode

Users who land on a deep page (e.g., via search or external link) have no visual indication of where they are in the site hierarchy and no way to navigate up without using the browser back button.

Several pages already generate JSON-LD breadcrumb structured data for SEO -- this data exists but is invisible to users.

## Solution

### UX Design

Add a compact breadcrumb trail at the top of detail pages, below the header and above the page title.

```
┌─────────────────────────────────────────┐
│  Deaths > Decades > 2020s               │
│                                          │
│  Deaths in the 2020s                     │
│  145 actors have died since 2020         │
└─────────────────────────────────────────┘
```

**Design principles:**
- Small text, muted color (not competing with page title)
- Links for all levels except the current page (current is plain text)
- Separator: `>` or `/` (not `›` which is harder to read at small sizes)
- Truncate on mobile if breadcrumb trail is too long (show first + last with `...`)

### Breadcrumb Trails by Page Type

| Page | Breadcrumb Trail |
|------|-----------------|
| Movie | Home > {title} |
| Show | Home > {title} |
| Episode | Home > {show} > Season {n} > {episode} |
| Actor | Home > {name} |
| Cause category | Causes of Death > {category} |
| Specific cause | Causes of Death > {category} > {cause} |
| Genre | Genres > {genre} |
| Deaths decade | Deaths > Decades > {decade} |
| Notable deaths | Deaths > Notable |
| COVID deaths | Deaths > COVID-19 |

## Technical Implementation

### New Component: Breadcrumb

**File:** `src/components/common/Breadcrumb.tsx` (new)

```tsx
interface BreadcrumbItem {
  label: string
  href?: string  // undefined = current page (no link)
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 text-sm text-brown-medium/70">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link to={item.href} className="hover:text-brown-dark hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="text-brown-dark" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
```

### Page Integrations

Each page builds its breadcrumb array and passes it to the component:

```tsx
// Example: Specific cause of death page
<Breadcrumb items={[
  { label: "Causes of Death", href: "/causes-of-death" },
  { label: category.name, href: `/causes-of-death/${category.slug}` },
  { label: cause.name },  // current page, no href
]} />
```

### JSON-LD Alignment

Pages that already generate JSON-LD breadcrumb data should derive both the visual breadcrumb and the structured data from the same source array. This prevents them from diverging.

```tsx
const breadcrumbItems = [
  { label: "Causes of Death", href: "/causes-of-death" },
  { label: category.name, href: `/causes-of-death/${category.slug}` },
  { label: cause.name },
]

// Visual breadcrumb
<Breadcrumb items={breadcrumbItems} />

// JSON-LD (already exists in many pages -- derive from same data)
<script type="application/ld+json">
  {JSON.stringify(buildBreadcrumbJsonLd(breadcrumbItems))}
</script>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/common/Breadcrumb.tsx` (new) | Breadcrumb component |
| Cause of death pages | Add breadcrumbs |
| Genre pages | Add breadcrumbs |
| Deaths pages (decades, notable, covid) | Add breadcrumbs |
| Episode pages | Add breadcrumbs (show > season > episode) |

## Anti-Patterns

1. **Don't add breadcrumbs to the home page** -- It's the root. Breadcrumbs start from the first level down.
2. **Don't add breadcrumbs to every page** -- Simple detail pages (movie, actor) with flat hierarchies may not need them. Focus on pages with clear parent-child relationships.
3. **Don't use breadcrumbs as the primary navigation** -- They supplement nav links, not replace them.
4. **Don't make breadcrumbs too prominent** -- Small, muted text. They're a wayfinding aid, not a primary UI element.
5. **Don't duplicate JSON-LD breadcrumb logic** -- Derive both visual and structured data from the same source.
