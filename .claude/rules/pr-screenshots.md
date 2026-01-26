---
description: "Load when creating PRs with UI changes"
---
# PR Screenshots

For UI changes: take screenshots → **VERIFY** → commit to `e2e/screenshots/` → include in PR description

| Scenario | Include |
|----------|---------|
| Visual changes | Before AND after |
| New features | After only |
| Responsive | Desktop AND mobile |
| Bug fixes (visual) | After only |

## Standard Viewports

**ALWAYS set explicit viewport** for consistency across environments:

| Device | Dimensions | Use Case |
|--------|------------|----------|
| Desktop | `{ width: 1280, height: 800 }` | Default for most screenshots |
| Mobile (iPhone SE) | `{ width: 375, height: 667 }` | Smallest modern mobile |
| Mobile (iPhone 14) | `{ width: 390, height: 844 }` | Common modern mobile |
| Tablet (iPad) | `{ width: 768, height: 1024 }` | Tablet testing |

## Taking Screenshots

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();

// ALWAYS set explicit viewport
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 }  // REQUIRED
});

await page.goto('http://localhost:5173/your-page');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);  // Allow animations to complete

// PREFERRED: Screenshot specific element (smaller file size)
await page.locator('[data-testid="your-component"]').first().screenshot({
  path: 'e2e/screenshots/feature.png'
});

// Alternative: Screenshot visible viewport
await page.screenshot({
  path: 'e2e/screenshots/feature.png'
});

// Use sparingly: Full page screenshot (large file)
await page.screenshot({
  path: 'e2e/screenshots/feature-full.png',
  fullPage: true  // Creates large files
});

await browser.close();
```

## Verification Step (CRITICAL)

**NEVER commit a screenshot without verifying it first**. Common issues:
- Wrong page (login screen, 404 page)
- Wrong state (loading spinner, empty data)
- Wrong size (accidentally fullPage: true)
- Wrong viewport (inconsistent with other screenshots)

```bash
# After taking screenshot, VERIFY before committing
open e2e/screenshots/feature.png  # macOS
# OR
xdg-open e2e/screenshots/feature.png  # Linux

# Check:
# ✓ Is it the right page/component?
# ✓ Is data loaded (not a loading state)?
# ✓ Is the file size reasonable (<500KB for targeted, <2MB for full page)?
# ✓ Does it show what we want to demonstrate?

# If verification passes, then commit
git add e2e/screenshots/feature.png
git commit -m "Add screenshot showing feature"
```

## Size Management

Keep screenshot file sizes reasonable:

| Type | Max Size | Notes |
|------|----------|-------|
| Targeted element | 500 KB | Preferred - screenshot specific component |
| Viewport | 1 MB | Full visible area |
| Full page | 2 MB | Use sparingly - only when necessary |

**To reduce size**:
- Screenshot specific elements with `.locator()`, not full page
- Use `fullPage: false` (default)
- Use standard viewport sizes
- Compress if needed: `pngquant screenshot.png`

## Naming Conventions

Use descriptive, kebab-case names:

```bash
# GOOD
actor-page-mortality-stats.png
bug-fix-null-pointer-before.png
bug-fix-null-pointer-after.png

# BAD
screenshot.png
image1.png
test.png
```

## PR Description

**NEVER use relative paths** - use GitHub raw URLs with commit SHA:

```bash
# 1. Commit screenshot
git add e2e/screenshots/feature.png
git commit -m "Add screenshot showing feature"

# 2. Get commit SHA
SHA=$(git rev-parse HEAD)

# 3. Use in PR description
![Feature](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/feature.png)
```

### Before/After Pattern

```markdown
## Screenshots

### Before Fix
![Before](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/bug-before.png)

### After Fix
![After](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/bug-after.png)
```

### Desktop/Mobile Pattern

```markdown
## Screenshots

### Desktop
![Desktop](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/feature-desktop.png)

### Mobile
![Mobile](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/feature-mobile.png)
```

## Complete Workflow

See `.claude/rules/github-cli.md` for detailed examples including multi-viewport screenshots and integration with PR creation.
