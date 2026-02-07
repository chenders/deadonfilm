# 06: Enhance Quick Actions for Mobile

**Priority:** #6 (High)
**Confidence:** 7/10
**Effort:** Small (1-2 days)
**Dependencies:** None

## Problem

The Quick Actions section on the home page uses CSS `group-hover:opacity-100` for tooltip descriptions. On mobile/touch devices, hover events don't fire, so users see only emoji icons and short labels like "Death Watch" or "Forever Young" with no explanation of what these features do.

The current tooltip implementation in `src/components/search/QuickActions.tsx`:

```
pointer-events-none absolute ... opacity-0 ... group-hover:opacity-100
```

This is fundamentally broken on touch devices -- `pointer-events-none` prevents taps, and `group-hover` never activates.

## Solution

### UX Design

**Desktop (>=768px):** Keep current hover tooltip behavior -- it works well with a mouse.

**Mobile (<768px):** Show short descriptions always-visible below each Quick Action button. No tooltip needed.

```
Desktop:                          Mobile:
┌───────────────────┐            ┌───────────────────┐
│  💀 Death Watch   │            │  💀 Death Watch   │
│  (tooltip on hover)│           │  Aging actors most │
│                    │            │  likely to die next│
│  👼 Forever Young  │            │                    │
│  (tooltip on hover)│            │  👼 Forever Young  │
│                    │            │  Actors who died   │
└───────────────────┘            │  under 40          │
                                  └───────────────────┘
```

### Short Descriptions

| Quick Action | Short Description |
|-------------|-------------------|
| Forever Young | Actors who died under 40 |
| COVID-19 Deaths | Actors lost to the pandemic |
| Unnatural Deaths | Accidents, murders, suicides |
| Death Watch | Aging actors most at risk |
| Causes of Death | How actors died, categorized |
| Notable Deaths | Famous actors who have died |
| Deaths by Decade | Deaths across the decades |

## Technical Implementation

### File: `src/components/search/QuickActions.tsx`

Replace the hover-only tooltip `<span>` with a responsive approach:

```tsx
{/* Desktop: hover tooltip (existing behavior) */}
<span className="hidden md:block pointer-events-none absolute ... opacity-0 group-hover:opacity-100 ...">
  {action.tooltip}
</span>

{/* Mobile: always-visible description */}
<span className="block md:hidden mt-1 text-xs text-brown-medium/70 leading-tight">
  {action.shortDescription}
</span>
```

Add `shortDescription` to each quick action's data:

```typescript
const quickActions = [
  {
    label: "Forever Young",
    emoji: "👼",
    tooltip: "Actors who were taken too soon — died before the age of 40",
    shortDescription: "Actors who died under 40",
    path: "/forever-young",
  },
  // ... etc
]
```

### Layout Adjustment

The current Quick Actions layout may need adjustment for mobile to accommodate the always-visible descriptions:

- **Desktop**: Keep current grid/flex layout with equal-sized buttons
- **Mobile**: Switch to a 2-column grid or vertical list to give room for descriptions

```tsx
<div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:justify-center md:gap-4">
  {quickActions.map(action => (
    <Link key={action.path} to={action.path} className="group ...">
      <span className={emojiClass}>{action.emoji}</span>
      <span>{action.label}</span>
      {/* Mobile description */}
      <span className="block md:hidden text-xs text-brown-medium/70">
        {action.shortDescription}
      </span>
      {/* Desktop tooltip */}
      <span className="hidden md:block ... group-hover:opacity-100">
        {action.tooltip}
      </span>
    </Link>
  ))}
</div>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/search/QuickActions.tsx` | Add short descriptions, responsive tooltip/description rendering |

## Anti-Patterns

1. **Don't replace hover tooltips on desktop** -- They work fine with a mouse. Only add visible descriptions for mobile.
2. **Don't use the `HoverTooltip` component here** -- Quick Actions need always-visible descriptions on mobile, not click-to-toggle tooltips. HoverTooltip is better suited for individual info icons.
3. **Don't make descriptions too long** -- Keep them under 6 words. The mobile layout is tight.
4. **Don't add tap-to-toggle** -- Quick Actions are links, not info triggers. Tapping should navigate, not show a tooltip.
