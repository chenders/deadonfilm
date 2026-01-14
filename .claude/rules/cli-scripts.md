---
globs: ["server/scripts/**"]
---
# CLI Scripts

All scripts MUST use [Commander.js](https://github.com/tj/commander.js).

```typescript
#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from "commander"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("Must be positive integer")
  return n
}

const program = new Command()
  .name("script-name")
  .description("What it does")
  .argument("[optional]", "Desc", parsePositiveInt)
  .argument("<required>", "Desc")
  .option("-n, --dry-run", "Preview")
  .option("-c, --count <n>", "Count", parsePositiveInt, 100)
  .action(async (opt, req, opts) => { await run(opts) })

program.parse()
```

| Pattern | Meaning |
|---------|---------|
| `[arg]` | Optional |
| `<arg>` | Required |
| End of file | MUST call `program.parse()` |
