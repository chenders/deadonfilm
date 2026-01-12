---
globs: ["server/scripts/**"]
---
# CLI Script Patterns

All CLI scripts MUST use [Commander.js](https://github.com/tj/commander.js) for argument parsing.

## Required Pattern

```typescript
#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from "commander"

// Custom argument validators
function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseYear(value: string): number {
  const year = parsePositiveInt(value)
  if (year < 1900 || year > new Date().getFullYear()) {
    throw new InvalidArgumentError("Must be a valid year")
  }
  return year
}

const program = new Command()
  .name("script-name")
  .description("What the script does")
  .argument("[optional]", "Description", parseYear)
  .argument("<required>", "Description", parsePositiveInt)
  .option("-n, --dry-run", "Preview changes without writing")
  .option("-c, --count <number>", "Number of items", parsePositiveInt, 100)
  .action(async (arg1, arg2, options) => {
    // Validate mutually exclusive options in action handler
    if (options.optionA && options.optionB) {
      console.error("Error: Cannot specify both --option-a and --option-b")
      process.exit(1)
    }
    await runScript(options)
  })

program.parse()
```

## Conventions

| Pattern | Usage |
|---------|-------|
| `[brackets]` | Optional arguments |
| `<brackets>` | Required arguments |
| `InvalidArgumentError` | Throw for validation errors |
| 4th param to `.option()` | Default values |
| Action handler | Validate mutually exclusive options |
| End of file | MUST call `program.parse()` |