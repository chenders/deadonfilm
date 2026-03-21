# Respond to Copilot

Review and respond to GitHub Copilot review comments on a pull request. Loops until Copilot has no new comments.

## Arguments

- `$ARGUMENTS` - PR number or branch name (optional, defaults to current branch)

## Instructions

### Per-round steps

1. **Identify the PR**
   - If PR number provided, use directly
   - Otherwise find PR for current branch via `gh pr view`

2. **Fetch all review comments**

   ```bash
   gh api repos/chenders/deadonfilm/pulls/{PR}/comments | jq '.[] | {id, body, path, line}'
   ```

3. **Check for new comments** — If there are no new unaddressed comments since the last round, the loop is done. Report the final status and stop.

4. **Analyze each new comment**
   - Validity: Is the suggestion technically correct?
   - Value: Would it improve code quality?
   - Scope: Is it within the scope of this PR?

5. **Categorize**: Will implement / Won't implement / Needs discussion

   **IMPORTANT: Never defer work or create issues without explicit user approval.** If a suggestion is valid but out of scope, attempt to implement it if reasonably small. If too large, ask the user.

6. **Implement accepted suggestions**
   - Make changes
   - Run tests: `npm test && cd server && npm test`
   - Run quality checks: `npm run lint && npm run type-check`
   - Commit: "Address Copilot review feedback"
   - Push changes

7. **Reply to each comment**

   ```bash
   gh api -X POST repos/chenders/deadonfilm/pulls/{PR}/comments/{COMMENT_ID}/replies -f body="Fixed in $(git rev-parse --short HEAD). Explanation."
   ```

   - **If implemented**: Reference commit SHA and explain
   - **If not implemented**: Explain why
   - **If needs discussion**: Ask clarifying questions

8. **Resolve implemented threads** (use PRRT* thread IDs, not PRRC* comment IDs)

   ```bash
   # Get thread IDs
   gh api graphql -f query='query { repository(owner: "chenders", name: "deadonfilm") { pullRequest(number: {PR}) { reviewThreads(first: 50) { nodes { id isResolved comments(first: 1) { nodes { body } } } } } } }'

   # Resolve
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "PRRT_..."}) { thread { isResolved } } }'
   ```

   Rules:
   - Resolve threads where you implemented the fix
   - Do NOT resolve threads where you declined

9. **Re-request Copilot review**:

   ```bash
   gh api repos/chenders/deadonfilm/pulls/{PR}/requested_reviewers -X POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
   ```

10. **Wait for the new review** — Capture baseline review count, then poll until it increases from a Copilot review:

    ```bash
    # Baseline: count Copilot reviews before re-request
    gh api repos/chenders/deadonfilm/pulls/{PR}/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer[bot]")] | length'
    ```

    Poll every 15 seconds using the same filter. Timeout after 10 minutes.

11. **Loop back to step 2** — Fetch comments again and check for new ones.

### Completion criteria

The loop ends when:

- Copilot's latest review has **no new comments** (clean review), OR
- The poll in step 10 times out (report this and stop)

When complete, report a summary: total rounds, comments addressed, comments declined.

## Notes

- Never dismiss suggestions without explanation
- Never defer work without explicit user approval
- Thread IDs (PRRT*) are NOT the same as comment IDs (PRRC*)
- Track comment IDs across rounds to distinguish new comments from previously addressed ones
- Copilot comments come from user login `Copilot`, but the reviewer bot is `copilot-pull-request-reviewer[bot]` — filter by both when needed
