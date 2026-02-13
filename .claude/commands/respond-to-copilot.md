# Respond to Copilot

Review and respond to GitHub Copilot review comments on a pull request.

## Arguments

- `$ARGUMENTS` - The PR number or branch name (optional, defaults to current branch)

## Instructions

1. **Identify the PR**
   - If a PR number is provided, use it directly
   - If a branch name is provided, find the PR for that branch
   - If no argument provided, use the current branch to find its PR
   - Run `gh pr view [PR] --json number,headRefName,url` to get PR details
   - Extract `{owner}` and `{repo}` from the repo: `gh repo view --json owner,name --jq '.owner.login + "/" + .name'`

2. **Fetch all review comments**
   - Run `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments` to get all review comments
   - Filter for comments where `.user.login == "copilot-pull-request-reviewer[bot]"`
   - Use jq to extract relevant fields: `jq '.[] | select(.user.login == "copilot-pull-request-reviewer[bot]") | {id, body, path, line, in_reply_to_id}'`
   - Also check `gh pr view [PR] --json reviews` for review-level comments from Copilot

3. **Read the code context for each comment**
   Before evaluating suggestions, read the actual source files referenced in each comment to understand the full context. Don't evaluate based on the comment text alone.

4. **Analyze each comment**
   For each Copilot comment, evaluate:
   - **Validity**: Is the suggestion technically correct?
   - **Relevance**: Does it apply to the actual code context?
   - **Value**: Would implementing it improve code quality, security, performance, or maintainability?
   - **Scope**: Is it within the scope of this PR, or is it unrelated cleanup?
   - **Trade-offs**: Are there downsides to the suggestion (complexity, over-engineering, etc.)?

5. **Categorize suggestions**
   - **Will implement**: Valid, valuable, and within scope
   - **Won't implement**: Invalid, not valuable, or has significant trade-offs
   - **Needs discussion**: Unclear or requires user input

   Present the categorization to the user before making changes. For each suggestion, briefly explain why you're implementing or declining it.

   **IMPORTANT: Never defer work or create issues without explicit user approval.** If a suggestion is valid but you believe it's out of scope:
   - First, attempt to implement it if it's reasonably small
   - If it's too large, ask the user: "This suggestion would require significant work. Should I implement it now, or would you prefer to defer it to a separate PR?"
   - Only create tracking issues if the user explicitly asks for deferral

6. **Make changes for accepted suggestions**
   - Implement the changes for suggestions you've decided to accept
   - Run tests to ensure changes don't break anything: `cd server && npm test`
   - Run quality checks: `npm run lint && npm run type-check`

7. **Commit and push changes before responding**
   - Stage and commit with a descriptive message (use heredoc format per project conventions)
   - Push the changes to update the PR
   - Note the commit SHA for use in responses: `git rev-parse --short HEAD`

8. **Respond to each comment on GitHub**
   Use `gh api` to reply to each comment:
   ```bash
   gh api -X POST repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
     -f body="Your response"
   ```

   Response format:
   - **If implemented**: Reference the commit SHA and explain what change was made. Use format: "Fixed in <commit_sha>. <explanation>"
   - **If not implemented**: Explain why (invalid suggestion, out of scope, trade-offs, etc.)
   - **If needs discussion**: Ask clarifying questions

9. **REQUIRED: Resolve implemented comment threads**

   **This step is mandatory for any comments where you implemented fixes.** Do not skip this step.

   After responding to comments, resolve the threads using the GraphQL API:

   **Step 9a:** Query for thread IDs (thread IDs have `PRRT_` prefix, different from comment IDs which have `PRRC_` prefix):

   ```bash
   gh api graphql -f query='
     query {
       repository(owner: "{owner}", name: "{repo}") {
         pullRequest(number: {pr_number}) {
           reviewThreads(first: 50) {
             nodes {
               id
               isResolved
               comments(first: 1) { nodes { body author { login } } }
             }
           }
         }
       }
     }
   '
   ```

   **Step 9b:** For each comment where you implemented the fix, resolve its thread using the `PRRT_` ID:
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
   - Resolve threads where you implemented the suggested fix
   - Do NOT resolve threads where you declined to make changes

10. **Request Copilot re-review if changes were made**

    If any changes were committed and pushed, request a new Copilot review using the REST API:

    ```bash
    gh api --method POST repos/{owner}/{repo}/pulls/{pr_number}/requested_reviewers \
      -f "reviewers[]=copilot-pull-request-reviewer[bot]"
    ```

    **NOTE:** `gh pr edit --add-reviewer` does NOT work for Copilot. You must use the REST API endpoint above with the bot's full login `copilot-pull-request-reviewer[bot]`.

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

- [ ] Fetched and analyzed all Copilot comments
- [ ] Read source code context for each comment
- [ ] Presented categorization to user
- [ ] Implemented accepted suggestions
- [ ] Ran tests and quality checks
- [ ] Committed and pushed changes
- [ ] Responded to each comment on GitHub
- [ ] **Resolved implemented comment threads** (step 9 - don't skip!)
- [ ] Requested Copilot re-review via REST API (if changes were made)

## Notes

- Be respectful and constructive in responses
- Don't dismiss suggestions without explanation
- If you're unsure about a suggestion, ask the user before responding
- Copilot's bot login is `copilot-pull-request-reviewer[bot]` — use this for filtering comments and requesting reviews
