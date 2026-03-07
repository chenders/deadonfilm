---
globs: ["server/scripts/**"]
---
# CLI Scripts

All scripts MUST use [Commander.js](https://github.com/tj/commander.js).

**CRITICAL:** All scripts MUST import `dotenv/config` as the first import to load environment variables.

```typescript
#!/usr/bin/env tsx
import "dotenv/config"  // MUST be first import
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

## Error Handling

Wrap main logic in try-catch. Use `process.exitCode = 1` (not `process.exit(1)`) so `finally` blocks run and connections are cleaned up:

```typescript
async function run(options: Options) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    // ... main logic
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
```

**Why not `process.exit(1)`?** It terminates immediately, skipping `finally` blocks. This leaks database connections and leaves Redis clients open, which can cause the process to hang or produce warnings. Setting `process.exitCode` lets Node.js exit naturally after cleanup completes.
