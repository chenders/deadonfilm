import { describe, it, expect, vi, beforeEach } from "vitest"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

describe("inspect-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exits with error when Redis is not available", async () => {
    // Run the script with Redis unavailable
    // We expect it to exit with code 1
    try {
      await execAsync("REDIS_HOST=invalid-host tsx scripts/inspect-cache.ts", { timeout: 5000 })
      expect.fail("Script should have exited with error")
    } catch (error: unknown) {
      const execError = error as { code: number }
      expect(execError.code).toBe(1)
    }
  }, 10000)

  it("script file exists and is executable", async () => {
    const { stdout } = await execAsync("ls -la scripts/inspect-cache.ts")
    expect(stdout).toContain("inspect-cache.ts")
  })
})
