---
globs: []
description: "Load when creating PRs with UI changes"
---
# Pull Request Screenshots

When creating a PR with UI changes, you MUST:

1. Take screenshots of all affected UI areas
2. Commit screenshots to `e2e/screenshots/`
3. Include screenshots in PR description using GitHub raw URLs
4. Verify screenshots render correctly on GitHub after creating PR

## Screenshot Requirements

| Scenario | What to Include |
|----------|-----------------|
| Visual changes | Before AND after screenshots |
| New features | After-only screenshots |
| Responsive changes | Both desktop AND mobile viewports |

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

**IMPORTANT: NEVER use relative paths** - they render as broken images on GitHub.

Use GitHub raw URLs with the commit SHA:

```markdown
![Feature Name](https://raw.githubusercontent.com/chenders/deadonfilm/{commit-sha}/e2e/screenshots/feature-name.png)
```

Get commit SHA after pushing: `git rev-parse HEAD`