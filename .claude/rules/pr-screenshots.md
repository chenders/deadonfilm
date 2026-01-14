---
description: "Load when creating PRs with UI changes"
---
# PR Screenshots

For PRs with UI changes:

1. Take screenshots of affected UI areas
2. Commit to `e2e/screenshots/`
3. Include in PR description using GitHub raw URLs

| Scenario | Include |
|----------|---------|
| Visual changes | Before AND after |
| New features | After only |
| Responsive | Desktop AND mobile |

## Taking Screenshots

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/your-page');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e/screenshots/feature-name.png' });
await browser.close();
```

## PR Description Format

**NEVER use relative paths** - they break on GitHub.

```markdown
![Feature](https://raw.githubusercontent.com/chenders/deadonfilm/{commit-sha}/e2e/screenshots/feature.png)
```

Get SHA after pushing: `git rev-parse HEAD`
