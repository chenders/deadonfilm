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
   - **Won't implement**: Invalid, not valuable, out of scope, or has significant trade-offs
   - **Needs discussion**: Unclear or requires user input

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

8. **Resolve implemented comments**
   After responding to comments you implemented fixes for, resolve them using the GraphQL API:
   ```bash
   gh api graphql -f query='
     mutation {
       resolveReviewThread(input: {threadId: "THREAD_NODE_ID"}) {
         thread { isResolved }
       }
     }
   '
   ```

   To get the thread ID, use the `node_id` from the comment (e.g., `PRRC_kwDO...`).

   **Important**: Only resolve comments where you implemented the suggested fix. Do NOT resolve comments where you declined to make changes - leave those open for the reviewer to acknowledge your reasoning.

## Example Responses

**Implemented:**
> Fixed in 2f50cc1. Added null check before accessing the property to prevent potential runtime errors.

**Not implemented (invalid):**
> This suggestion doesn't apply here - the variable is already guaranteed to be non-null at this point due to the guard clause on line 42.

**Not implemented (trade-off):**
> Chose not to implement this. While the suggested abstraction would reduce duplication, it would also add complexity for a pattern that only appears twice in the codebase. Will reconsider if this pattern appears more frequently.

**Not implemented (out of scope):**
> This is a valid suggestion but outside the scope of this PR. I've noted it for a future cleanup PR.

## Notes

- Be respectful and constructive in responses
- Don't dismiss suggestions without explanation
- If you're unsure about a suggestion, ask the user before responding
- Copilot comments may appear as regular review comments or as part of a review
