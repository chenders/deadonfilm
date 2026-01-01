---
globs: []
description: "Load when creating PRs with UI changes"
---
# Pull Request Screenshots

When creating a PR that includes UI changes:

1. **Take screenshots** of all affected UI areas using Playwright or the browser
2. **Commit screenshots** to the `e2e/screenshots/` directory
3. **Include screenshots in the PR description** using GitHub raw URLs
4. **Verify screenshots are visible** by checking the PR on GitHub after creating it

## Screenshot Requirements

- **Before/After screenshots**: If making visual changes, include both
- **After-only screenshots**: If before screenshots aren't available (e.g., new feature)
- **Multiple viewports**: Include both desktop and mobile when the change affects responsive layouts

## Taking Screenshots with Playwright

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:5173/your-page');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500); // Allow animations to complete
await page.screenshot({ path: 'e2e/screenshots/feature-name.png' });

await browser.close();
```

## Including in PR Description

**IMPORTANT: Do NOT use relative paths** - they appear as broken images on GitHub!

Use GitHub raw URLs:
```markdown
![Feature Name](https://raw.githubusercontent.com/chenders/deadonfilm/{commit-sha}/e2e/screenshots/feature-name.png)
```

Get the commit SHA after pushing: `git rev-parse HEAD`