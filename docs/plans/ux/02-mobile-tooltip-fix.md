# 02: Fix Mobile Tooltip Accessibility on Actor Pages

**Priority:** #2 (Critical)
**Confidence:** 9/10
**Effort:** Small (1-2 days)
**Dependencies:** None

## Problem

`src/pages/ActorPage.tsx` uses a custom `Tooltip` component that relies on `onMouseEnter` and `onMouseLeave` events. These events don't fire on mobile touch devices, making tooltip content completely invisible to mobile users.

This affects important contextual information on actor detail pages -- users on phones and tablets cannot access any tooltip-gated content.

## Solution

### UX Design

Replace the custom hover-only `Tooltip` with the existing shared `HoverTooltip` component from `src/components/common/HoverTooltip.tsx`. This component already supports:

- **Hover** (desktop): Shows tooltip on mouse enter, hides on leave
- **Click/Tap** (mobile): Toggles tooltip visibility on touch
- **Keyboard**: Enter/Space to open, Escape to close
- **Outside click**: Closes tooltip when tapping elsewhere
- **Portal rendering**: Positions correctly regardless of parent overflow
- **Film strip decoration**: Matches site's visual theme

No new component needed -- this is a drop-in replacement.

### Interaction Model

| Device | Trigger | Dismiss |
|--------|---------|---------|
| Desktop | Hover | Mouse leave |
| Mobile | Tap | Tap elsewhere or tap again |
| Keyboard | Enter/Space | Escape |

## Technical Implementation

### File: `src/pages/ActorPage.tsx`

Find all instances of the custom `Tooltip` usage and replace with `HoverTooltip`:

```tsx
// Before
<Tooltip content="Explanation text here">
  <InfoIcon />
</Tooltip>

// After
import { HoverTooltip } from "../components/common/HoverTooltip"

<HoverTooltip content="Explanation text here">
  <InfoIcon />
</HoverTooltip>
```

The `HoverTooltip` component accepts:

```typescript
interface HoverTooltipProps {
  content: string
  children: ReactNode
  className?: string
  testId?: string
  onOpen?: () => void
}
```

### Testing

1. **Desktop**: Verify hover still works as before
2. **Mobile**: Test tap-to-toggle on iOS Safari and Android Chrome
3. **Keyboard**: Tab to tooltip trigger, press Enter/Space to open, Escape to close
4. **Overflow**: Verify tooltip positions correctly when near viewport edges (portal rendering handles this)

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ActorPage.tsx` | Replace custom Tooltip with HoverTooltip |

## Anti-Patterns

1. **Don't add a new tooltip component** -- `HoverTooltip` already exists and handles all interaction modes
2. **Don't use `title` attribute as fallback** -- It's inaccessible and inconsistently rendered across browsers
3. **Don't use `@media (hover: hover)` to conditionally show content** -- Users on devices with both touch and mouse would get inconsistent behavior
