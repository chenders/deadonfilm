---
description: "Complete reference for GitHub CLI operations, branch workflow, PR comments, screenshots, and Copilot reviews"
---
# GitHub CLI Operations

Complete reference for GitHub CLI operations, commit/PR formatting, screenshot workflows, and Copilot review handling.

## Table of Contents

- [Branch Workflow](#branch-workflow)
- [PR Comment Operations](#pr-comment-operations)
- [Copilot Review Workflow](#copilot-review-workflow)
- [Commit Message Formatting](#commit-message-formatting)
- [PR Description Formatting](#pr-description-formatting)
- [Screenshot Workflow](#screenshot-workflow)
- [Complete Workflow Examples](#complete-workflow-examples)
- [Quick Reference](#quick-reference)

## Branch Workflow

**CRITICAL: NEVER commit directly to `main`**. Always use feature branches.

### Before Starting ANY New Work

```bash
# 1. Ensure you're on main and it's up to date
git checkout main
git pull

# 2. Create a new feature branch
git checkout -b feat/descriptive-name  # or fix/, chore/, docs/
```

### Branch Naming Conventions

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features | `feat/github-cli-docs` |
| `fix/` | Bug fixes | `fix/null-pointer-in-actor-api` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` |
| `docs/` | Documentation only | `docs/update-readme` |

### During Work: Creating Sub-branches

**When substantial new work is about to begin while already on a feature branch**, ask the user if they want to create a new branch for the new work:

```bash
# Example: You're on feat/github-cli-docs and user asks to implement a new feature
# ASK: "We're currently on feat/github-cli-docs. Would you like to:
#       1. Create a new branch for this work (recommended if unrelated)
#       2. Continue on the current branch (if closely related)"
```

**When to create a new branch**:
- New work is logically separate from current branch
- Current branch already has commits ready for PR
- New work might take longer than current work
- User wants to keep changes isolated

**When to continue on current branch**:
- New work is directly related to current changes
- User wants all changes in one PR
- Current branch has no commits yet

### Committing on Feature Branches

```bash
# Standard workflow
git add .
git commit -m "$(cat <<'EOF'
Short summary

Details here

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Pushing Feature Branches

```bash
# First push (creates remote branch)
git push -u origin feat/branch-name

# Subsequent pushes
git push
```

### Creating Pull Requests

```bash
# Create PR after pushing branch
gh pr create --title "Brief description" --body "$(cat <<'EOF'
## Summary

What this PR does

## Changes

- List of changes
- Another change

## Test Plan

- [x] Tests pass
- [x] Manual testing completed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR Comment Operations

### Understanding GitHub IDs

GitHub uses different ID types for PR review operations:

| ID Type | Format | Used For | Example |
|---------|--------|----------|---------|
| **Comment ID** | `PRRC_...` | Individual review comments, replying | `PRRC_kwDOABcD1234` |
| **Thread ID** | `PRRT_...` | Review conversation threads, resolving | `PRRT_kwDOABcD5678` |
| **Review ID** | Numeric | Entire review submissions | `123456789` |

**Critical**: Thread IDs (`PRRT_`) are NOT the same as comment IDs (`PRRC_`). You must use thread IDs for resolving, not comment IDs.

### Reading PR Comments

The native `gh pr view` command only shows review bodies, NOT inline comments on code. Use the REST API:

```bash
# Get all inline comments on a PR
gh api "repos/chenders/deadonfilm/pulls/123/comments" | jq '.[] | {id, body, path, line}'

# Filter comments by specific user (e.g., Copilot)
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | select(.user.login == "Copilot") | {id, body, path, line}'

# Get full comment details including thread info
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | {id, body, path, line, in_reply_to_id, created_at}'
```

### Responding to Comments

Reply to a specific comment using its comment ID:

```bash
# Reply to a review comment
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="Fixed in abc1234. Added null check to prevent runtime error."

# Reply with multiline message (use heredoc)
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="$(cat <<'EOF'
Fixed in commit abc1234.

Changes:
- Added null check for actor.death_date
- Updated tests to cover edge case
- Added JSDoc comment explaining the logic
EOF
)"
```

### Resolving Review Threads

**CRITICAL RULES**:
1. **ALWAYS reply before resolving** - Don't silently resolve threads
2. **NEVER resolve threads for declined suggestions** - Only resolve when you've implemented the fix
3. **Use thread IDs (`PRRT_`) for resolving** - Not comment IDs (`PRRC_`)

**Step 1: Get thread IDs** (thread IDs ≠ comment IDs):

```bash
gh api graphql -f query='
  query {
    repository(owner: "chenders", name: "deadonfilm") {
      pullRequest(number: 123) {
        reviewThreads(first: 50) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                body
                author { login }
              }
            }
          }
        }
      }
    }
  }
' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | {id, isResolved, preview: .comments.nodes[0].body[0:100]}'
```

**Step 2: Resolve a thread** (only after implementing the fix and replying):

```bash
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "PRRT_kwDOABcD..."}) {
      thread { isResolved }
    }
  }
'
```

### Complete PR Comment Workflow

```bash
# 1. Get PR info to identify owner/repo
gh pr view --json number,headRefName,baseRepository

# 2. Read all review comments
gh api "repos/chenders/deadonfilm/pulls/123/comments" | jq '.[] | {id, body, path, line}'

# 3. Implement the fix in your code
# ... make changes, run tests ...

# 4. Commit the fix
git add .
git commit -m "$(cat <<'EOF'
Fix null pointer in actor death date handling

Added null check before accessing death_date property to prevent runtime error.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# 5. Push the fix
git push

# 6. Reply to each comment
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="Fixed in $(git rev-parse --short HEAD). Added null check to prevent runtime error."

# 7. Get thread IDs for resolving
gh api graphql -f query='...' # (see "Get thread IDs" above)

# 8. Resolve each thread (only after implementing AND replying)
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "PRRT_kwDOABcD..."}) {
      thread { isResolved }
    }
  }
'

# 9. Request Copilot re-review after all fixes
gh pr edit 123 --add-reviewer Copilot
```

## Copilot Review Workflow

### Requesting Initial Review

When creating a PR, Copilot auto-reviews if enabled in repo settings. To manually request:

```bash
# Assign Copilot as reviewer
gh pr create --reviewer Copilot --title "..." --body "..."

# Or add to existing PR
gh pr edit 123 --add-reviewer Copilot
```

### Reading Copilot Comments

Copilot comments appear as regular review comments:

```bash
# Get all Copilot comments
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | select(.user.login == "Copilot") | {id, body, path, line}'

# Get Copilot review summary
gh pr view 123 --json reviews | \
  jq '.reviews[] | select(.author.login == "Copilot") | {state, body}'
```

### Implementing Copilot Suggestions

1. **Read the suggestion** - Understand what Copilot is recommending
2. **Evaluate the suggestion** - Does it make sense for your codebase?
3. **Implement if appropriate** - Make the changes, run tests
4. **Commit the fix** - Use descriptive commit message (see Commit Formatting section)
5. **Reply to the comment** - Explain what you did
6. **Resolve the thread** - Only after implementing AND replying
7. **Request re-review** - Let Copilot verify your changes

### Responding to Copilot

**When implementing suggestion**:
```bash
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="Fixed in $(git rev-parse --short HEAD). Added null check as suggested."
```

**When declining suggestion**:
```bash
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="Not implementing: this would break compatibility with existing API clients that expect the field to be present (even if null)."

# DO NOT resolve thread when declining - leave it open or mark as "won't fix"
```

### Requesting Re-review

After implementing fixes and replying to comments:

```bash
# Re-assign Copilot to trigger re-review
gh pr edit 123 --add-reviewer Copilot
```

**When Copilot re-reviews**:
- After you re-assign it as reviewer
- When you push new commits (if auto-review is enabled)
- When you mark the PR as ready for review (from draft)

## Commit Message Formatting

### Why Heredoc?

Bash interprets special characters in strings, causing issues with multiline commit messages:

```bash
# WRONG - quotes, newlines, and special chars break
git commit -m "Fix bug

Added check for null values"  # Fails: unclosed quote

# WRONG - escape hell
git commit -m "Fix bug\n\nAdded check for null values"  # Literal \n in message

# CORRECT - heredoc handles all special characters
git commit -m "$(cat <<'EOF'
Fix bug

Added check for null values
EOF
)"
```

### Heredoc Syntax

```bash
# Quoted delimiter (RECOMMENDED) - prevents variable expansion
cat <<'EOF'
Text with $variables that won't be expanded
EOF

# Unquoted delimiter - allows variable expansion
cat <<EOF
Text with $variables that WILL be expanded
EOF
```

**Always use quoted delimiter** (`<<'EOF'`) for commit messages to prevent accidental variable expansion.

### Standard Commit Format

```bash
git commit -m "$(cat <<'EOF'
Short summary line (imperative mood, <72 chars)

Longer description paragraph explaining the change. Focus on WHY, not WHAT.
The diff shows what changed; the message explains why it was necessary.

- Bullet points for multiple changes
- Each point starts with a verb
- Keep lines under 72 characters

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Common Mistakes

```bash
# WRONG - unquoted delimiter expands variables
git commit -m "$(cat <<EOF
Fix $bug_name
EOF
)"  # If $bug_name is unset, message becomes "Fix "

# WRONG - no heredoc, breaks on special chars
git commit -m "Fix: Added check for actor's death date"  # Breaks on apostrophe

# WRONG - missing command substitution $()
git commit -m cat <<'EOF'
Message
EOF  # Doesn't work - missing $()

# CORRECT - quoted delimiter, proper syntax
git commit -m "$(cat <<'EOF'
Fix: Added check for actor's death date
EOF
)"
```

### Multi-line Example

```bash
git add server/src/routes/actors.ts server/src/routes/actors.test.ts

git commit -m "$(cat <<'EOF'
Add null check for actor death date in API response

The /api/actors/:id endpoint was throwing runtime errors when accessing
death_date on actors without death information. Added null check and
updated response typing to reflect optional death_date field.

Changes:
- Add null check before accessing actor.death_date
- Update ActorResponse type to mark death_date as optional
- Add test case for actor without death information
- Add JSDoc comment explaining the null handling

Fixes runtime error: "Cannot read property 'date' of null"

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## PR Description Formatting

### Using Heredoc for PR Body

GitHub PR descriptions have the same escaping issues as commit messages. Use heredoc:

```bash
# WRONG - breaks on special characters
gh pr create --title "Fix bug" --body "Added check for actor's name"

# CORRECT - heredoc handles special characters
gh pr create --title "Fix null pointer in actor API" --body "$(cat <<'EOF'
## Summary

Fixed runtime error when fetching actors without death information.

## Changes

- Added null check before accessing `actor.death_date`
- Updated `ActorResponse` type to reflect optional `death_date`
- Added test coverage for actors without death info

## Test Plan

- [x] Unit tests pass
- [x] Manual testing with actor ID 12345 (alive actor)
- [x] Manual testing with actor ID 67890 (deceased actor)

## Screenshots

![Before fix](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/bug-before.png)

![After fix](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/bug-after.png)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Including Screenshots in PR

**CRITICAL**: Use GitHub raw URLs with commit SHA, not relative paths.

```bash
# 1. Take screenshots (see Screenshot Workflow section)
# 2. Verify screenshots are correct (see Verification section)
# 3. Commit screenshots
git add e2e/screenshots/bug-after.png
git commit -m "Add screenshot showing bug fix"
git push

# 4. Get commit SHA
SHA=$(git rev-parse HEAD)

# 5. Create PR with screenshot URLs
# Note: Use unquoted heredoc delimiter to allow $SHA variable expansion
gh pr create --title "Fix null pointer bug" --body "$(cat <<EOF
## Summary

Fixed null pointer error in actor API.

## Screenshots

![After fix](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/bug-after.png)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Alternative**: Manually construct URL after creating PR (simpler for complex cases):

```bash
# 1. Get current commit SHA
git rev-parse HEAD
# Output: abc123def456...

# 2. Use this format in PR description:
# https://raw.githubusercontent.com/chenders/deadonfilm/abc123def456/e2e/screenshots/feature.png
```

## Screenshot Workflow

### When to Take Screenshots

| Scenario | Screenshots to Include | Viewports |
|----------|----------------------|-----------|
| Visual changes | Before AND after | Desktop (+ mobile if responsive change) |
| New features | After only | Desktop (+ mobile if responsive design) |
| Bug fixes (visual) | After only | Desktop (+ mobile if affects mobile) |
| Responsive changes | Before AND after | Desktop AND mobile |

### Standard Viewports

```typescript
// Desktop (default for most screenshots)
{ width: 1280, height: 800 }

// Mobile - iPhone SE
{ width: 375, height: 667 }

// Mobile - iPhone 14
{ width: 390, height: 844 }

// Tablet - iPad
{ width: 768, height: 1024 }
```

### Taking Screenshots with Playwright

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();

// ALWAYS set explicit viewport for consistency
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 }  // REQUIRED
});

// Navigate and wait for content
await page.goto('http://localhost:5173/actor/john-wayne-2157');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);  // Allow animations to complete

// Option A: Screenshot specific element (PREFERRED - keeps file size small)
await page.locator('[data-testid="actor-filmography"]').first().screenshot({
  path: 'e2e/screenshots/actor-filmography-mortality.png'
});

// Option B: Screenshot visible viewport
await page.screenshot({
  path: 'e2e/screenshots/actor-page-mortality.png'
});

// Option C: Full page screenshot (use sparingly - creates large files)
await page.screenshot({
  path: 'e2e/screenshots/actor-page-full.png',
  fullPage: true
});

await browser.close();
```

### Screenshot Naming Conventions

Use descriptive, kebab-case names:

```bash
# GOOD - descriptive, clear purpose
actor-page-mortality-stats.png
admin-date-picker-calendar.png
ab-tests-provider-comparison.png
bug-fix-null-pointer-before.png
bug-fix-null-pointer-after.png

# BAD - vague, unclear
screenshot.png
image1.png
test.png
page.png
```

### Verification Step (CRITICAL)

**NEVER commit a screenshot without verifying it first.** Common issues:
- Wrong page (login screen, 404 page)
- Wrong state (loading spinner, empty data)
- Wrong size (accidentally fullPage: true)
- Wrong viewport (inconsistent with other screenshots)

```bash
# After taking screenshot, verify it before committing

# macOS
open e2e/screenshots/actor-filmography-mortality.png

# Linux
xdg-open e2e/screenshots/actor-filmography-mortality.png

# Windows (WSL)
explorer.exe e2e/screenshots/actor-filmography-mortality.png

# Check:
# ✓ Is it the right page/component?
# ✓ Is data loaded (not a loading state)?
# ✓ Is the file size reasonable (<500KB for targeted, <2MB for full page)?
# ✓ Does it show what we want to demonstrate?

# If verification passes, commit
git add e2e/screenshots/actor-filmography-mortality.png
git commit -m "Add screenshot showing mortality stats in filmography"
```

### Size Management

Keep screenshot file sizes reasonable:

| Type | Recommended Max Size | Notes |
|------|---------------------|-------|
| Targeted element | 500 KB | Preferred - screenshot specific component |
| Viewport | 1 MB | Full visible area |
| Full page | 2 MB | Use sparingly - only when necessary |

**To reduce size**:
- Screenshot specific elements, not full page
- Use `fullPage: false` (default)
- Use standard viewport sizes (1280x800)
- Compress PNGs if needed: `pngquant screenshot.png`

### Before/After Screenshot Pattern

```markdown
## Screenshots

### Before Fix
![Before - error shown](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/bug-before.png)

### After Fix
![After - working correctly](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/bug-after.png)
```

```markdown
## Screenshots

### Desktop
![Desktop view](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/feature-desktop.png)

### Mobile
![Mobile view](https://raw.githubusercontent.com/chenders/deadonfilm/abc1234/e2e/screenshots/feature-mobile.png)
```

### Complete Screenshot Workflow Example

```bash
# 1. Start local dev server
npm run dev

# 2. Create Playwright script (or use interactive browser)
cat > take-screenshots.ts <<'SCRIPT'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 }
});

await page.goto('http://localhost:5173/actor/john-wayne-2157');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);

// Take targeted screenshot of mortality stats section
await page.locator('[data-testid="mortality-stats"]').first().screenshot({
  path: 'e2e/screenshots/actor-mortality-stats.png'
});

await browser.close();
SCRIPT

# 3. Run screenshot script
npx tsx take-screenshots.ts

# 4. VERIFY screenshot
open e2e/screenshots/actor-mortality-stats.png
# Check: Right component? Data loaded? Reasonable size?

# 5. If good, commit
git add e2e/screenshots/actor-mortality-stats.png
git commit -m "Add screenshot showing mortality stats component"

# 6. Push
git push

# 7. Get SHA for PR description
git rev-parse HEAD
# abc123def456...

# 8. Include in PR description
gh pr view --json url -q .url  # Get PR URL
# Edit PR description to add:
# ![Mortality Stats](https://raw.githubusercontent.com/chenders/deadonfilm/abc123def456/e2e/screenshots/actor-mortality-stats.png)
```

## Complete Workflow Examples

### Example 1: Responding to Copilot Review

```bash
# Scenario: Copilot suggested adding null check in actor API

# 1. Read Copilot's comments
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | select(.user.login == "Copilot") | {id, body, path, line}'

# Output shows:
# {
#   "id": 1234567,
#   "body": "Add null check before accessing death_date",
#   "path": "server/src/routes/actors.ts",
#   "line": 45
# }

# 2. Implement the fix
# ... edit server/src/routes/actors.ts ...
# ... add tests in server/src/routes/actors.test.ts ...

# 3. Run tests
cd server && npm test

# 4. Commit the fix
git add server/src/routes/actors.ts server/src/routes/actors.test.ts

git commit -m "$(cat <<'EOF'
Add null check for actor death date in API

Added null check before accessing death_date property to prevent
runtime error when fetching actors without death information.

Changes:
- Add null check in GET /api/actors/:id handler
- Update ActorResponse type to mark death_date as optional
- Add test case for actors without death info

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# 5. Push the fix
git push

# 6. Reply to Copilot's comment
COMMIT_SHA=$(git rev-parse --short HEAD)
gh api -X POST "repos/chenders/deadonfilm/pulls/123/comments/1234567/replies" \
  -f body="Fixed in $COMMIT_SHA. Added null check and test coverage."

# 7. Get thread ID for this comment
gh api graphql -f query='
  query {
    repository(owner: "chenders", name: "deadonfilm") {
      pullRequest(number: 123) {
        reviewThreads(first: 50) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                body
              }
            }
          }
        }
      }
    }
  }
' | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.comments.nodes[0].body | contains("Add null check")) | .id'

# Output: "PRRT_kwDOABcD1234"

# 8. Resolve the thread
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "PRRT_kwDOABcD1234"}) {
      thread { isResolved }
    }
  }
'

# 9. Request Copilot re-review
gh pr edit 123 --add-reviewer Copilot
```

### Example 2: Complete Screenshot Workflow

```bash
# Scenario: Adding new mortality stats component to actor page

# 1. Implement the feature
# ... code changes ...

# 2. Start dev server
npm run dev

# 3. Create screenshot script
cat > screenshots.ts <<'SCRIPT'
import { chromium } from 'playwright';

const browser = await chromium.launch();

// Desktop screenshot
const desktop = await browser.newPage({
  viewport: { width: 1280, height: 800 }
});
await desktop.goto('http://localhost:5173/actor/john-wayne-2157');
await desktop.waitForLoadState('networkidle');
await desktop.waitForTimeout(500);
await desktop.locator('[data-testid="mortality-stats"]').first().screenshot({
  path: 'e2e/screenshots/mortality-stats-desktop.png'
});

// Mobile screenshot
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 }
});
await mobile.goto('http://localhost:5173/actor/john-wayne-2157');
await mobile.waitForLoadState('networkidle');
await mobile.waitForTimeout(500);
await mobile.locator('[data-testid="mortality-stats"]').first().screenshot({
  path: 'e2e/screenshots/mortality-stats-mobile.png'
});

await browser.close();
SCRIPT

# 4. Take screenshots
npx tsx screenshots.ts

# 5. VERIFY both screenshots
open e2e/screenshots/mortality-stats-desktop.png
open e2e/screenshots/mortality-stats-mobile.png
# Check: Right component? Data loaded? Reasonable sizes?

# 6. Commit screenshots
git add e2e/screenshots/mortality-stats-desktop.png e2e/screenshots/mortality-stats-mobile.png
git commit -m "Add screenshots for mortality stats component"

# 7. Commit code changes
git add src/components/MortalityStats.tsx src/components/MortalityStats.test.tsx
git commit -m "$(cat <<'EOF'
Add mortality stats component to actor pages

New component displays curse score, years lost, and expected vs actual
deaths for actors based on their filmography.

Changes:
- New MortalityStats component with responsive design
- Desktop and mobile layouts
- Test coverage for all stat calculations
- Integration with existing actor page layout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# 8. Push all commits
git push

# 9. Get SHA for screenshots
SHA=$(git rev-parse HEAD)

# 10. Create PR with screenshots
# Note: Use unquoted heredoc delimiter to allow $SHA variable expansion
gh pr create --title "Add mortality stats component to actor pages" --body "$(cat <<EOF
## Summary

New component showing mortality statistics on actor pages:
- Curse score (actual vs expected deaths)
- Years lost (life expectancy vs actual)
- Expected deaths from filmography

## Screenshots

### Desktop
![Desktop view](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/mortality-stats-desktop.png)

### Mobile
![Mobile view](https://raw.githubusercontent.com/chenders/deadonfilm/$SHA/e2e/screenshots/mortality-stats-mobile.png)

## Test Plan

- [x] Unit tests pass (MortalityStats.test.tsx)
- [x] Manual testing on desktop (Chrome, Firefox, Safari)
- [x] Manual testing on mobile (iPhone 14, Pixel 6)
- [x] Verified stat calculations against database queries

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Example 3: Multi-Round Review Cycle

```bash
# Round 1: Initial Copilot review
gh pr create --reviewer Copilot --title "..." --body "..."

# Read initial comments
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | select(.user.login == "Copilot")'

# Implement fixes, commit, reply, resolve (see Example 1)

# Round 2: Request re-review
gh pr edit 123 --add-reviewer Copilot

# Wait for Copilot to re-review (check PR page or use gh pr checks)

# Read new comments
gh api "repos/chenders/deadonfilm/pulls/123/comments" | \
  jq '.[] | select(.user.login == "Copilot") | select(.created_at > "2026-01-25T12:00:00Z")'

# Implement any remaining fixes, commit, reply, resolve

# Round 3: Final re-review
gh pr edit 123 --add-reviewer Copilot

# Once Copilot approves, merge
gh pr merge 123 --squash
```

## Quick Reference

### Most Common Commands

```bash
# Read PR comments
gh api "repos/OWNER/REPO/pulls/PR/comments"

# Reply to comment
gh api -X POST "repos/OWNER/REPO/pulls/PR/comments/COMMENT_ID/replies" -f body="..."

# Get thread IDs
gh api graphql -f query='query { repository(owner: "OWNER", name: "REPO") { pullRequest(number: PR) { reviewThreads(first: 50) { nodes { id isResolved comments(first: 1) { nodes { body } } } } } } }'

# Resolve thread
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "PRRT_..."}) { thread { isResolved } } }'

# Request Copilot re-review
gh pr edit PR --add-reviewer Copilot

# Commit with heredoc
git commit -m "$(cat <<'EOF'
Summary

Details

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Create PR with heredoc
gh pr create --title "..." --body "$(cat <<'EOF'
PR description
EOF
)"

# Get commit SHA
git rev-parse HEAD
```

### Critical Rules Checklist

Before committing/pushing:
- [ ] Used heredoc for multiline commit messages
- [ ] Verified screenshots (not login screen, correct page)
- [ ] Set explicit viewport size in Playwright scripts
- [ ] Used GitHub raw URLs with commit SHA (not relative paths)
- [ ] Replied to review comments before resolving threads
- [ ] Only resolved threads for implemented fixes (not declined suggestions)
- [ ] Used thread IDs (`PRRT_`) for resolving, not comment IDs (`PRRC_`)
- [ ] Requested Copilot re-review after implementing fixes
