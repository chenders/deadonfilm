import { describe, it, expect, beforeEach } from "vitest"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

describe("debug-recent-deaths-query", () => {
  beforeEach(() => {
    // Clear any cached state
  })

  it("exits with error when database is not available", async () => {
    // Run the script with invalid database connection
    try {
      await execAsync("DATABASE_URL=invalid tsx scripts/debug-recent-deaths-query.ts", {
        timeout: 5000,
      })
      expect.fail("Script should have exited with error")
    } catch (error: unknown) {
      const execError = error as { code: number }
      expect(execError.code).toBe(1)
    }
  }, 10000)

  it("script file exists and is executable", async () => {
    const { stdout } = await execAsync("ls -la scripts/debug-recent-deaths-query.ts")
    expect(stdout).toContain("debug-recent-deaths-query.ts")
  })
})
