# Respond to Copilot

Review and respond to GitHub Copilot review comments on a pull request. Loops until Copilot has no new comments.

## Arguments

- `$ARGUMENTS` - PR number or branch name (optional, defaults to current branch)

## Instructions

### Per-round steps

1. **Identify the PR**
   - If PR number provided, use directly
   - Otherwise find PR for current branch via `gh pr view`

2. **Fetch all review comments from BOTH endpoints**

   Copilot posts comments via two different mechanisms. You MUST check both:

   **Endpoint A — PR-level comments** (inline diff comments):
   ```bash
   gh api --paginate repos/chenders/deadonfilm/pulls/{pr_number}/comments --jq '.[] | {id, body, path, line}'
   ```

   **Endpoint B — Review-attached comments** (comments posted as part of a review):
   ```bash
   # First get all review IDs from Copilot
   REVIEW_IDS=$(gh api --paginate repos/chenders/deadonfilm/pulls/{pr_number}/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | .id')

   # Then fetch comments for each review
   for rid in $REVIEW_IDS; do
     gh api --paginate repos/chenders/deadonfilm/pulls/{pr_number}/reviews/$rid/comments --jq '.[] | {id, body, path, line}'
   done
   ```

   Merge the results from both endpoints, deduplicating by comment ID (the same comment may appear in both).

3. **Check for new comments** — If there are no new unaddressed comments (from either endpoint) since the last round, the loop is done. Report the final status and stop.

4. **Analyze each new comment**
   - **Validity**: Is the suggestion technically correct?
   - **Relevance**: Does it apply to the actual code context?
   - **Value**: Would implementing it improve code quality, security, performance, or maintainability?
   - **Scope**: Is it within the scope of this PR, or is it unrelated cleanup?
   - **Trade-offs**: Are there downsides to the suggestion (complexity, over-engineering, etc.)?

5. **Categorize suggestions**
   - **Will implement**: Valid, valuable, and within scope
   - **Won't implement**: Invalid, not valuable, or has significant trade-offs
   - **Needs discussion**: Unclear or requires user input

   **IMPORTANT: Never defer work or create issues without explicit user approval.** If a suggestion is valid but you believe it's out of scope:
   - First, attempt to implement it if it's reasonably small
   - If it's too large, ask the user: "This suggestion would require significant work. Should I implement it now, or would you prefer to defer it to a separate PR?"
   - Only create tracking issues if the user explicitly asks for deferral

6. **Implement accepted suggestions**
   - Make changes
   - Run tests: `npm test && cd server && npm test`
   - Run quality checks: `npm run lint && npm run type-check`
   - Commit: "Address Copilot review feedback"
   - Push changes
   - Note the commit SHA: `git rev-parse --short HEAD`

7. **Reply to each comment**

   ```bash
   gh api -X POST repos/chenders/deadonfilm/pulls/{pr_number}/comments/{id}/replies -f body="Fixed in $(git rev-parse --short HEAD). Explanation."
   ```

   Response format:
   - **If implemented**: "Fixed in <sha>. <explanation>"
   - **If not implemented**: Explain why
   - **If needs discussion**: Ask clarifying questions

8. **Resolve implemented threads** (use PRRT_ thread IDs, not PRRC_ comment IDs)

   ```bash
   # Get thread IDs
   gh api graphql -f query='query { repository(owner: "chenders", name: "deadonfilm") { pullRequest(number: {pr_number}) { reviewThreads(first: 50) { nodes { id isResolved comments(first: 1) { nodes { body } } } } } } }'

   # Resolve
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "PRRT_..."}) { thread { isResolved } } }'
   ```

   Rules:
   - Resolve threads where you implemented the fix
   - Do NOT resolve threads where you declined

9. **Re-request Copilot review** — capture the review count BEFORE re-requesting to avoid a race condition where the review arrives instantly:

   ```bash
   # Capture baseline FIRST — filter to Copilot reviews only and paginate
   BEFORE_COUNT=$(gh api --paginate repos/chenders/deadonfilm/pulls/{pr_number}/reviews --jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | .id' | wc -l | tr -d ' ')

   # Then re-request
   gh api repos/chenders/deadonfilm/pulls/{pr_number}/requested_reviewers -X POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
   ```

10. **Wait for the new review** — Poll until Copilot review count exceeds `BEFORE_COUNT`:

    ```bash
    gh api --paginate repos/chenders/deadonfilm/pulls/{pr_number}/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer[bot]")] | length'
    ```

    Poll every 15 seconds. Timeout after 10 minutes (assume review is delayed).

    **CRITICAL:** The baseline count MUST be captured before re-requesting (step 9). If captured after, the new review may already be included, causing the poll to never trigger.

11. **Loop back to step 2** — Fetch comments again and check for new ones.

### Completion criteria

The loop ends when:

- Copilot's latest review has **no new comments** (clean review), OR
- The poll in step 10 times out (report this and stop), OR
- **Diminishing returns**: 3+ consecutive rounds where ALL comments are cosmetic/stylistic rather than bug fixes, security issues, or correctness improvements

### Judging diminishing returns

Err on the side of **continuing** — it's better to do one extra round than to miss a real bug before it reaches `main`. A comment is worth implementing if it:

- Fixes a potential bug, race condition, or data corruption issue
- Addresses a security concern (injection, URL validation, etc.)
- Prevents silent failures or data loss
- Improves type safety in ways that catch real errors
- Adds missing test coverage for new behavior
- Fixes accessibility violations (WCAG, aria)
- Reduces meaningful code duplication (not just stylistic DRY)

A comment is likely diminishing returns if it:

- Suggests renaming variables for style preference
- Requests comments/documentation that don't affect correctness
- Proposes abstractions for code that appears only 1-2 times
- Suggests performance optimizations without evidence of a problem
- Repeats a suggestion already addressed in a prior round (Copilot reviewing stale diff)

When you judge a full round as diminishing returns, still reply to each comment explaining your reasoning, but note in your summary that you're stopping the loop. If even ONE comment in a round is a real bug or correctness issue, continue.

When complete, report a summary: total rounds, comments addressed, comments declined.

## Example Responses

**Implemented (simple fix):**
> Fixed in 2f50cc1. Added null check before accessing the property to prevent potential runtime errors.

**Implemented (security fix):**
> Fixed in 5d9ef34. Changed from string interpolation to parameterized query to prevent SQL injection.

**Not implemented (invalid):**
> This suggestion doesn't apply here - the variable is already guaranteed to be non-null at this point due to the guard clause on line 42.

**Not implemented (trade-off):**
> Chose not to implement this. While the suggested abstraction would reduce duplication, it would also add complexity for a pattern that only appears twice in the codebase.

## Notes

- Never dismiss suggestions without explanation
- Never defer work without explicit user approval
- Thread IDs (PRRT_) are NOT the same as comment IDs (PRRC_)
- Track comment IDs across rounds to distinguish new comments from previously addressed ones
- **CRITICAL:** GitHub has two comment endpoints — `pulls/{pr}/comments` (PR-level) and `pulls/{pr}/reviews/{review_id}/comments` (review-level). Copilot uses BOTH. Always check both endpoints or you will miss comments.