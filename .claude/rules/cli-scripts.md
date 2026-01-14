---
globs: ["server/scripts/**"]
---
# CLI Scripts

All CLI scripts MUST use [Commander.js](https://github.com/tj/commander.js).

## Required Pattern

```typescript
#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from "commander"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("script-name")
  .description("What the script does")
  .argument("[optional]", "Description", parsePositiveInt)
  .argument("<required>", "Description")
  .option("-n, --dry-run", "Preview without writing")
  .option("-c, --count <n>", "Number of items", parsePositiveInt, 100)
  .action(async (arg1, arg2, options) => {
    await runScript(options)
  })

program.parse()
```

## Conventions

| Pattern | Usage |
|---------|-------|
| `[brackets]` | Optional arguments |
| `<brackets>` | Required arguments |
| `InvalidArgumentError` | Validation errors |
| End of file | MUST call `program.parse()` |
