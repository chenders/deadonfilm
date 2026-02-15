# Do Commit

Prepare and commit the current work with proper documentation and tests.

## Instructions

1. **Analyze current changes**
   - Run `git status` and `git diff` to understand what has changed
   - Identify the scope and nature of the changes (new feature, bug fix, refactor, etc.)

2. **Update documentation if needed**
   - Review `CLAUDE.md` - update if there are new patterns, commands, environment variables, or architectural changes
   - Review `docs/` folder - update relevant docs if the changes affect documented features
   - Check if `copilot-instructions.md` exists and needs updates for VS Code Copilot users
   - Do NOT create new documentation files unless the changes truly warrant it

3. **Review and add tests**
   - Check if the changes include new functionality that needs tests
   - Check if existing tests need to be updated for the changes
   - For frontend changes: add/update tests in `src/**/*.test.{ts,tsx}`
   - For backend changes: add/update tests in `server/src/**/*.test.ts`
   - Run `npm test` (frontend) and `cd server && npm test` (backend) to verify tests pass

4. **Format code** (lint-staged handles lint/format on commit, CI handles type-check)
   - Run `npm run format && cd server && npm run format` to auto-format before staging

5. **Create the commit**
   - Stage all relevant changes with `git add`
   - Write a clear, concise commit message that:
     - Summarizes the changes in the first line (imperative mood)
     - Explains the "why" if not obvious
     - References any related issues or PRs if applicable
   - Include the Claude Code footer in the commit message

## Notes

- If tests fail, fix them before committing
- If lint/format/type-check fails, fix the issues before committing
- Do not commit files that contain secrets or sensitive data
- Ask the user if you're unsure whether documentation updates are needed
