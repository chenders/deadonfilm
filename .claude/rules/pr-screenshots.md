---
description: "Load when creating PRs with UI changes"
---
# PR Screenshots

For UI changes: take screenshots → commit to `e2e/screenshots/` → include in PR description

| Scenario | Include |
|----------|---------|
| Visual changes | Before AND after |
| New features | After only |
| Responsive | Desktop AND mobile |

## Playwright Screenshot

```javascript
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/your-page');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'e2e/screenshots/feature.png' });
await browser.close();
```

## PR Description

**NEVER use relative paths** - use GitHub raw URLs:

```markdown
![Feature](https://raw.githubusercontent.com/chenders/deadonfilm/{commit-sha}/e2e/screenshots/feature.png)
```

Get SHA: `git rev-parse HEAD`
