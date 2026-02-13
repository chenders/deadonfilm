# Respond to Copilot

Review and respond to GitHub Copilot review comments on a pull request.

## Arguments

- `$ARGUMENTS` - The PR number or branch name (optional, defaults to current branch)

## Instructions

1. **Identify the PR**
   - If a PR number is provided, use it directly
   - If a branch name is provided, find the PR for that branch
   - If no argument provided, use the current branch to find its PR
   - Run `gh pr view [PR] --json number,headRefName,comments,reviews` to get PR details

2. **Fetch all review comments**
   - Run `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments` to get all review comments
   - Filter for comments from `github-actions[bot]` or `copilot` that represent Copilot suggestions
   - Also check `gh pr view [PR] --json reviews` for review-level comments

3. **Analyze each comment**
   For each Copilot comment, evaluate:
   - **Validity**: Is the suggestion technically correct?
   - **Relevance**: Does it apply to the actual code context?
   - **Value**: Would implementing it improve code quality, security, performance, or maintainability?
   - **Scope**: Is it within the scope of this PR, or is it unrelated cleanup?
   - **Trade-offs**: Are there downsides to the suggestion (complexity, over-engineering, etc.)?

4. **Categorize suggestions**
   - **Will implement**: Valid, valuable, and within scope
   - **Won't implement**: Invalid, not valuable, or has significant trade-offs
   - **Needs discussion**: Unclear or requires user input

   **IMPORTANT: Never defer work or create issues without explicit user approval.** If a suggestion is valid but you believe it's out of scope:
   - First, attempt to implement it if it's reasonably small
   - If it's too large, ask the user: "This suggestion would require significant work. Should I implement it now, or would you prefer to defer it to a separate PR?"
   - Only create tracking issues if the user explicitly asks for deferral

5. **Make changes for accepted suggestions**
   - Implement the changes for suggestions you've decided to accept
   - Run tests to ensure changes don't break anything: `npm test && cd server && npm test`
   - Run quality checks: `npm run lint && npm run type-check`

6. **Commit and push changes before responding**
   - Stage and commit with a message like: "Address Copilot review feedback"
   - Push the changes to update the PR
   - Note the commit SHA for use in responses: `git rev-parse --short HEAD`

7. **Respond to each comment on GitHub**
   Use `gh api` to reply to each comment:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
     -method POST -f body="Your response"
   ```

   Response format:
   - **If implemented**: Reference the commit SHA and explain what change was made. Use format: "Fixed in <commit_sha>. <explanation>"
   - **If not implemented**: Explain why (invalid suggestion, out of scope, trade-offs, etc.)
   - **If needs discussion**: Ask clarifying questions

8. **REQUIRED: Resolve implemented comment threads**

   **This step is mandatory for any comments where you implemented fixes.** Do not skip this step.

   After responding to comments, resolve the threads using the GraphQL API:

   **Step 8a:** Query for thread IDs (thread IDs have `PRRT_` prefix, different from comment IDs which have `PRRC_` prefix):

   ```bash
   gh api graphql -f query='
     query {
       repository(owner: "{owner}", name: "{repo}") {
         pullRequest(number: {pr_number}) {
           reviewThreads(first: 50) {
             nodes {
               id
               isResolved
               comments(first: 1) { nodes { body } }
             }
           }
         }
       }
     }
   '
   ```

   **Step 8b:** For each comment where you implemented the fix, resolve its thread using the `PRRT_` ID:
   ```bash
   gh api graphql -f query='
     mutation {
       resolveReviewThread(input: {threadId: "PRRT_kwDO..."}) {
         thread { isResolved }
       }
     }
   '
   ```

   **Rules:**
   - ✅ Resolve threads where you implemented the suggested fix
   - ❌ Do NOT resolve threads where you declined to make changes

9. **Request another Copilot review if changes were made**
   If any changes were committed and pushed, request a new Copilot review:
   ```bash
   gh pr edit {pr_number} --add-reviewer Copilot
   ```

   This ensures Copilot reviews the fixes and any new issues introduced by the changes.

## Example Responses

**Implemented (simple fix):**
> Fixed in 2f50cc1. Added null check before accessing the property to prevent potential runtime errors.

**Implemented (refactoring):**
> Fixed in 3a8bc12. Extracted the shared logic into a reusable utility function in `src/lib/utils.ts` and updated both call sites to use it.

**Implemented (security fix):**
> Fixed in 5d9ef34. Changed from string interpolation to parameterized query to prevent SQL injection.

**Not implemented (invalid):**
> This suggestion doesn't apply here - the variable is already guaranteed to be non-null at this point due to the guard clause on line 42.

**Not implemented (trade-off):**
> Chose not to implement this. While the suggested abstraction would reduce duplication, it would also add complexity for a pattern that only appears twice in the codebase. Will reconsider if this pattern appears more frequently.

## Completion Checklist

Before finishing, verify you have completed ALL of these steps:

- [ ] Analyzed all Copilot comments
- [ ] Implemented accepted suggestions
- [ ] Ran tests and quality checks
- [ ] Committed and pushed changes
- [ ] Responded to each comment on GitHub
- [ ] **Resolved implemented comment threads** (step 8 - don't skip!)
- [ ] Requested Copilot re-review (if changes were made)

## Notes

- Be respectful and constructive in responses
- Don't dismiss suggestions without explanation
- If you're unsure about a suggestion, ask the user before responding
- Copilot comments may appear as regular review comments or as part of a review
