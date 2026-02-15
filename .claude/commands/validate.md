# Validate

Run all quality checks on demand. This is NOT required before commits or PRs — lint-staged handles pre-commit checks and CI handles everything else.

## Instructions

Run the following checks **in parallel** where possible:

### 1. Format Check (both frontend and backend)
```bash
npm run format:check
cd server && npm run format:check
```

### 2. Lint (both frontend and backend)
```bash
npm run lint
cd server && npm run lint
```

### 3. Type Check (both frontend and backend)
```bash
npm run type-check
cd server && npm run type-check
```

### 4. Tests (both frontend and backend)
```bash
npm test
cd server && npm test
```

## Output

Report results clearly:

```
Validation Results:
- Format:  [PASS/FAIL]
- Lint:    [PASS/FAIL]
- Types:   [PASS/FAIL]
- Tests:   [PASS/FAIL]
```

## On Failure

If any check fails:

1. **Format failures**: Offer to auto-fix with `npm run format && cd server && npm run format`
2. **Lint failures**: Show the specific errors and affected files
3. **Type failures**: Show type errors with file locations
4. **Test failures**: Show failed test names and assertion errors

## Notes

- Run all 8 commands (4 frontend + 4 backend) in parallel for speed
- This is a standalone command for manual verification — NOT called automatically by other commands
- Pre-commit (lint-staged) catches lint/format issues; CI catches everything on PR
