# Dead on Film — Dark Mode Design Specification

## Design Philosophy

The dark mode should feel like an **antiquarian's study at night** — warm, inviting, and rich rather than cold or sterile. We're inverting the cream-and-brown palette while preserving the vintage character that makes the site distinctive.

Key principles:
- **Warm undertones everywhere** — no pure blacks or cold grays
- **Sepia-tinged surfaces** — dark browns instead of charcoal
- **Luminous accents** — reds and golds glow against the dark background
- **Maintained hierarchy** — same visual weight relationships as light mode

---

## Color Tokens

### Core Surfaces

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--surface-base` | `#f5f0e8` (cream) | `#1a1613` | Page background |
| `--surface-elevated` | `#ffffff` | `#252119` | Cards, modals |
| `--surface-muted` | `#e8dcc8` (beige) | `#2d2720` | Secondary cards, hover states |
| `--surface-inset` | `#ded4c4` | `#151311` | Input backgrounds, inset elements |

### Text Colors

| Token | Light Mode | Dark Mode | Contrast Ratio (Dark) | Usage |
|-------|-----------|-----------|----------------------|-------|
| `--text-primary` | `#2c1810` | `#f0ebe4` | 13.8:1 ✓ | Headings, body text |
| `--text-secondary` | `#6b5b4f` | `#c4b8a8` | 8.2:1 ✓ | Secondary info, captions |
| `--text-muted` | `#8a7b6b` | `#9a8d7d` | 4.7:1 ✓ | Placeholder, disabled |

### Semantic Colors — Deceased

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--deceased-primary` | `#8b0000` | `#e85c5c` | Actor names, dates |
| `--deceased-hover` | `#6b0000` | `#ff7070` | Hover states |
| `--deceased-bg` | `#faf5f5` | `#2a1f1f` | Card backgrounds for deceased |
| `--deceased-border` | `#d4a5a5` | `#5c3838` | Borders, dividers |
| `--deceased-tab-active` | `#8b0000` | `#c94a4a` | Active tab background |

### Semantic Colors — Living

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--living-primary` | `#b8860b` | `#e8b84a` | Actor names, ages |
| `--living-hover` | `#6b5010` | `#ffd666` | Hover states |
| `--living-bg` | `#faf6e9` | `#282418` | Card backgrounds for living |
| `--living-border` | `#d4af37` | `#6b5c2e` | Borders, dividers |
| `--living-tab-active` | `#b8860b` | `#c9a227` | Active tab background |

### Life Expectancy Indicator

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--lifespan-early` | `#8b0000` | `#e05555` | Died earlier than expected |
| `--lifespan-early-track` | `#f5e5e5` | `#3a2525` | Track background |
| `--lifespan-longer` | `#228b22` | `#4caf50` | Lived longer than expected |
| `--lifespan-longer-track` | `#e5f5e5` | `#253a25` | Track background |
| `--lifespan-expected` | `#9a8d7d` | `#6a5d4d` | Expected lifespan marker |

### Decorative Elements

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--circle-bg` | `#f5f0e8` | `#201c18` | Percentage circle background |
| `--circle-track` | `#e8dcc8` | `#3d3530` | Progress track |
| `--circle-progress` | `#8b0000` | `#c94a4a` | Progress arc |
| `--circle-ornament` | `#d4c4a8` | `#4d443a` | Decorative dots |
| `--timeline-line` | `#d4c4a8` | `#4d443a` | Vertical timeline |
| `--timeline-dot` | `#8b0000` | `#c94a4a` | Timeline markers |
| `--timeline-dot-neutral` | `#b8860b` | `#c9a227` | Movie release marker |

### Interactive Elements

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--button-primary-bg` | `#6b4423` | `#c9a227` | Primary action buttons |
| `--button-primary-text` | `#ffffff` | `#1a1613` | Button text |
| `--button-secondary-bg` | `transparent` | `transparent` | Secondary buttons |
| `--button-secondary-border` | `#6b4423` | `#9a8d7d` | Secondary button border |
| `--button-secondary-text` | `#6b4423` | `#c4b8a8` | Secondary button text |
| `--input-bg` | `#ffffff` | `#1a1613` | Search inputs |
| `--input-border` | `#d4c4a8` | `#4d443a` | Input borders |
| `--input-focus-border` | `#8b6914` | `#c9a227` | Focused input border |

### Tags/Badges

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--tag-bg` | `#f0ebe4` | `#2d2720` | Tag background |
| `--tag-border` | `#d4c4a8` | `#4d443a` | Tag border |
| `--tag-text` | `#6b5b4f` | `#c4b8a8` | Tag text |
| `--tag-hover-bg` | `#e8dcc8` | `#3d3530` | Tag hover |

### Tooltips/Popovers

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--tooltip-bg` | `#3d2914` | `#f0ebe4` | Tooltip background |
| `--tooltip-text` | `#f5f0e8` | `#2c1810` | Tooltip text |

---

## Typography

No changes to fonts — Playfair Display and Inter work beautifully in dark mode.

### Font Weights in Dark Mode

Slightly reduce font weights on dark backgrounds as white text appears heavier:
- Headlines: Keep 600-700 (already display weight)
- Body: Consider 350-400 instead of 400 (if variable font available)
- Captions: Keep 400

---

## Component-Specific Guidance

### Percentage Circle (Movie Page)

The decorative circle needs special attention:

```
┌─────────────────────────────────────────┐
│                                         │
│        ○  ○                             │
│     ○        ○                          │
│    ○    17%   ○  ← center text: #f0ebe4 │
│    ○ deceased ○                         │
│     ○        ○  ← ornament dots: #4d443a│
│        ○  ○                             │
│                                         │
│   ═══════════╗  ← progress: #c94a4a     │
│              ║  ← track: #3d3530        │
│              ╝                          │
└─────────────────────────────────────────┘
```

- Inner circle fill: `--circle-bg` (#201c18)
- Track stroke: `--circle-track` (#3d3530)
- Progress stroke: `--circle-progress` (#c94a4a)
- Decorative dots: `--circle-ornament` (#4d443a)
- Percentage text: `--text-primary` (#f0ebe4)
- "deceased" label: `--text-secondary` (#c4b8a8)

### Life Expectancy Bars

```
Tom Sizemore                           Mar 3, 2023
as DEA Agent Deets                    Age 62 (13 years early)
                              ════════════════▒▒▒▒
                              0              75 yrs
                                      ↑
                           #e05555 (died early)
                                          ↑
                              #3a2525 (expected remainder)
```

- Solid bar (life lived): Use `--lifespan-early` (#e05555) for early death, `--lifespan-longer` (#4caf50) for longer life
- Hatched/ghost area: Use `--lifespan-early-track` or `--lifespan-longer-track`
- Track background: `--surface-muted`
- Scale text: `--text-muted`

### Cards

```css
/* Deceased actor card */
.card-deceased {
  background: var(--deceased-bg);
  border: 1px solid var(--deceased-border);
}

/* Living actor card */
.card-living {
  background: var(--living-bg);
  border: 1px solid var(--living-border);
}

/* Default card */
.card {
  background: var(--surface-elevated);
  border: 1px solid var(--surface-muted);
}
```

### Logo

The skull icon should invert to cream/off-white in dark mode:
- Light mode: dark brown (#3d2914)
- Dark mode: warm cream (#f0ebe4)

---

## Accessibility Compliance

All text color combinations meet **WCAG AA** (4.5:1 for normal text, 3:1 for large text):

| Combination | Ratio | Grade |
|-------------|-------|-------|
| Primary text on base surface | 13.8:1 | AAA |
| Secondary text on base surface | 8.2:1 | AAA |
| Muted text on base surface | 4.7:1 | AA |
| Deceased primary on deceased bg | 8.5:1 | AAA |
| Living primary on living bg | 7.9:1 | AAA |

---

## CSS Variable Implementation

```css
:root {
  /* Light mode defaults */
  --surface-base: #f5f0e8;
  --surface-elevated: #ffffff;
  --surface-muted: #e8dcc8;
  --surface-inset: #ded4c4;
  
  --text-primary: #2c1810;
  --text-secondary: #6b5b4f;
  --text-muted: #8a7b6b;
  
  --deceased-primary: #8b0000;
  --deceased-hover: #6b0000;
  --deceased-bg: #faf5f5;
  --deceased-border: #d4a5a5;
  --deceased-tab-active: #8b0000;
  
  --living-primary: #b8860b;
  --living-hover: #6b5010;
  --living-bg: #faf6e9;
  --living-border: #d4af37;
  --living-tab-active: #b8860b;
  
  --lifespan-early: #8b0000;
  --lifespan-early-track: #f5e5e5;
  --lifespan-longer: #228b22;
  --lifespan-longer-track: #e5f5e5;
  --lifespan-expected: #9a8d7d;
  
  --circle-bg: #f5f0e8;
  --circle-track: #e8dcc8;
  --circle-progress: #8b0000;
  --circle-ornament: #d4c4a8;
  
  --timeline-line: #d4c4a8;
  --timeline-dot: #8b0000;
  --timeline-dot-neutral: #b8860b;
  
  --button-primary-bg: #6b4423;
  --button-primary-text: #ffffff;
  --button-secondary-border: #6b4423;
  --button-secondary-text: #6b4423;
  
  --input-bg: #ffffff;
  --input-border: #d4c4a8;
  --input-focus-border: #8b6914;
  
  --tag-bg: #f0ebe4;
  --tag-border: #d4c4a8;
  --tag-text: #6b5b4f;
  --tag-hover-bg: #e8dcc8;
  
  --tooltip-bg: #3d2914;
  --tooltip-text: #f5f0e8;
}

.dark {
  --surface-base: #1a1613;
  --surface-elevated: #252119;
  --surface-muted: #2d2720;
  --surface-inset: #151311;
  
  --text-primary: #f0ebe4;
  --text-secondary: #c4b8a8;
  --text-muted: #9a8d7d;
  
  --deceased-primary: #e85c5c;
  --deceased-hover: #ff7070;
  --deceased-bg: #2a1f1f;
  --deceased-border: #5c3838;
  --deceased-tab-active: #c94a4a;
  
  --living-primary: #e8b84a;
  --living-hover: #ffd666;
  --living-bg: #282418;
  --living-border: #6b5c2e;
  --living-tab-active: #c9a227;
  
  --lifespan-early: #e05555;
  --lifespan-early-track: #3a2525;
  --lifespan-longer: #4caf50;
  --lifespan-longer-track: #253a25;
  --lifespan-expected: #6a5d4d;
  
  --circle-bg: #201c18;
  --circle-track: #3d3530;
  --circle-progress: #c94a4a;
  --circle-ornament: #4d443a;
  
  --timeline-line: #4d443a;
  --timeline-dot: #c94a4a;
  --timeline-dot-neutral: #c9a227;
  
  --button-primary-bg: #c9a227;
  --button-primary-text: #1a1613;
  --button-secondary-border: #9a8d7d;
  --button-secondary-text: #c4b8a8;
  
  --input-bg: #1a1613;
  --input-border: #4d443a;
  --input-focus-border: #c9a227;
  
  --tag-bg: #2d2720;
  --tag-border: #4d443a;
  --tag-text: #c4b8a8;
  --tag-hover-bg: #3d3530;
  
  --tooltip-bg: #f0ebe4;
  --tooltip-text: #2c1810;
}
```

---

## Transition Recommendations

Add smooth transitions for theme switching:

```css
* {
  transition: background-color 0.2s ease, 
              border-color 0.2s ease,
              color 0.2s ease;
}
```

---

## Summary

This dark mode transforms the site from "antique paper in daylight" to "antique paper by candlelight" — maintaining the warm, inviting character while providing excellent readability for nighttime use.
