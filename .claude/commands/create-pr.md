# Create PR

Create a pull request with full validation and optional screenshots for UI changes.

## Arguments

- `$ARGUMENTS` - Optional PR title (will be inferred from branch name or changes if not provided)

## Instructions

### 1. Pre-flight validation

Run all quality checks first. Execute these commands in parallel:

```bash
# Frontend
npm run format:check
npm run lint
npm run type-check
npm test

# Backend
cd server && npm run format:check
cd server && npm run lint
cd server && npm run type-check
cd server && npm test
```

**If any check fails, STOP and report the failures.** Do not proceed until all checks pass.

### 2. Analyze changes

Understand what's being submitted:

```bash
git status
git diff main...HEAD --stat
git log main..HEAD --oneline
```

Determine:
- **Change type**: feature, fix, refactor, chore, docs
- **Areas affected**: frontend, backend, or both
- **UI changes**: Check if any of these paths are modified:
  - `src/components/**`
  - `src/pages/**`
  - `src/index.css`
  - `tailwind.config.js`

### 3. Take screenshots (if UI changes detected)

If UI-related files were changed:

a. **Check if dev server is running**. If not, start it:
   ```bash
   npm run dev:all &
   sleep 10  # Wait for server startup
   ```

b. **Identify affected pages** from the changed components/pages

c. **Take screenshots** using Playwright:
   ```typescript
   import { chromium } from 'playwright';

   const browser = await chromium.launch();

   // Desktop screenshot
   const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
   await desktopPage.goto('http://localhost:5173/affected-page');
   await desktopPage.waitForLoadState('networkidle');
   await desktopPage.waitForTimeout(500);
   await desktopPage.screenshot({ path: 'e2e/screenshots/pr-feature-desktop.png' });

   // Mobile screenshot (for responsive changes)
   const mobilePage = await browser.newPage({ viewport: { width: 375, height: 667 } });
   await mobilePage.goto('http://localhost:5173/affected-page');
   await mobilePage.waitForLoadState('networkidle');
   await mobilePage.waitForTimeout(500);
   await mobilePage.screenshot({ path: 'e2e/screenshots/pr-feature-mobile.png' });

   await browser.close();
   ```

d. **Stage screenshots**: `git add e2e/screenshots/pr-*.png`

### 4. Stage and commit

Stage all changes:
```bash
git add -A
```

Create commit with proper format:
```bash
git commit -m "$(cat <<'EOF'
Short summary of changes (imperative mood)

More detailed explanation if needed. Focus on the "why"
rather than the "what".

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### 5. Push branch

Ensure the branch is pushed to remote:
```bash
git push -u origin $(git branch --show-current)
```

### 6. Get commit SHA for screenshot URLs

```bash
COMMIT_SHA=$(git rev-parse HEAD)
```

### 7. Create pull request

Use `gh pr create` with proper formatting:

```bash
gh pr create --title "PR Title Here" --body "$(cat <<'EOF'
## Summary

- First bullet point describing a change
- Second bullet point
- Third bullet point

## Test plan

- [ ] Manual testing step 1
- [ ] Manual testing step 2
- [ ] Verify no regressions

## Screenshots

<!-- Only if UI changes were made -->
### Desktop
![Desktop](https://raw.githubusercontent.com/chenders/deadonfilm/COMMIT_SHA/e2e/screenshots/pr-feature-desktop.png)

### Mobile
![Mobile](https://raw.githubusercontent.com/chenders/deadonfilm/COMMIT_SHA/e2e/screenshots/pr-feature-mobile.png)

---
Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Replace `COMMIT_SHA` with the actual commit SHA from step 6.

### 8. Report completion

Output the PR URL so the user can review:
```
PR created: https://github.com/chenders/deadonfilm/pull/XXX
```

## Notes

- **Never push to main directly** - all work goes through PRs
- Screenshots must use `raw.githubusercontent.com` URLs, not relative paths
- If the branch already has a PR, use `gh pr view` to get the existing PR URL
- Include both desktop and mobile screenshots for responsive layout changes
- The PR description uses the format from `.claude/rules/pr-screenshots.md`

## Troubleshooting

- **Validation fails**: Fix the issues, then run `/create-pr` again
- **Screenshots fail**: Ensure dev server is running on port 5173
- **gh auth error**: Run `gh auth login` to authenticate with GitHub
- **Branch already has PR**: Command will show existing PR URL instead of creating duplicate
