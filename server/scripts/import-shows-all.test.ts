import { describe, it, expect } from "vitest"
import {
  PHASES,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  SYNC_TYPE,
  buildPhaseArgs,
  findPhaseIndex,
  truncateMessage,
} from "./import-shows-all.js"

describe("PHASES configuration", () => {
  it("has three phases in correct order", () => {
    expect(PHASES).toHaveLength(3)
    expect(PHASES[0].phase).toBe("popular")
    expect(PHASES[1].phase).toBe("standard")
    expect(PHASES[2].phase).toBe("obscure")
  })

  it("has correct maxShows for each phase", () => {
    expect(PHASES[0].maxShows).toBe(500)
    expect(PHASES[1].maxShows).toBe(2000)
    expect(PHASES[2].maxShows).toBe(5000)
  })
})

describe("constants", () => {
  it("has sensible MAX_RETRIES value", () => {
    expect(MAX_RETRIES).toBeGreaterThanOrEqual(1)
    expect(MAX_RETRIES).toBeLessThanOrEqual(10)
  })

  it("has sensible RETRY_DELAY_MS value", () => {
    expect(RETRY_DELAY_MS).toBeGreaterThanOrEqual(1000)
    expect(RETRY_DELAY_MS).toBeLessThanOrEqual(60000)
  })

  it("has correct SYNC_TYPE", () => {
    expect(SYNC_TYPE).toBe("show_import")
  })
})

describe("buildPhaseArgs", () => {
  describe("fresh start (no resume)", () => {
    it("builds args for fresh start on first attempt", () => {
      const args = buildPhaseArgs("popular", 500, false, 1, false)
      expect(args).toEqual(["--phase", "popular", "--max-shows", "500"])
    })

    it("includes --dry-run when specified", () => {
      const args = buildPhaseArgs("popular", 500, false, 1, true)
      expect(args).toEqual(["--phase", "popular", "--max-shows", "500", "--dry-run"])
    })

    it("uses --resume on retry attempts even if not resuming", () => {
      const args = buildPhaseArgs("popular", 500, false, 2, false)
      expect(args).toEqual(["--resume", "--max-shows", "500"])
    })

    it("uses --resume with --dry-run on retry attempts", () => {
      const args = buildPhaseArgs("standard", 2000, false, 3, true)
      expect(args).toEqual(["--resume", "--max-shows", "2000", "--dry-run"])
    })
  })

  describe("resume mode", () => {
    it("uses --resume on first attempt when resuming", () => {
      const args = buildPhaseArgs("standard", 2000, true, 1, false)
      expect(args).toEqual(["--resume", "--max-shows", "2000"])
    })

    it("uses --resume with --dry-run when resuming", () => {
      const args = buildPhaseArgs("obscure", 5000, true, 1, true)
      expect(args).toEqual(["--resume", "--max-shows", "5000", "--dry-run"])
    })

    it("uses --resume on retry attempts", () => {
      const args = buildPhaseArgs("popular", 500, true, 2, false)
      expect(args).toEqual(["--resume", "--max-shows", "500"])
    })
  })

  describe("different phases", () => {
    it("includes correct phase name for standard", () => {
      const args = buildPhaseArgs("standard", 1000, false, 1, false)
      expect(args).toContain("standard")
    })

    it("includes correct phase name for obscure", () => {
      const args = buildPhaseArgs("obscure", 3000, false, 1, false)
      expect(args).toContain("obscure")
    })

    it("includes correct maxShows value", () => {
      const args = buildPhaseArgs("popular", 1234, false, 1, false)
      expect(args).toContain("1234")
    })
  })
})

describe("findPhaseIndex", () => {
  it("returns 0 for popular phase", () => {
    expect(findPhaseIndex("popular")).toBe(0)
  })

  it("returns 1 for standard phase", () => {
    expect(findPhaseIndex("standard")).toBe(1)
  })

  it("returns 2 for obscure phase", () => {
    expect(findPhaseIndex("obscure")).toBe(2)
  })

  it("returns 0 for unknown phase (fallback)", () => {
    // TypeScript would normally prevent this, but testing runtime behavior
    expect(findPhaseIndex("unknown" as "popular")).toBe(0)
  })
})

describe("truncateMessage", () => {
  it("returns message unchanged when shorter than maxLength", () => {
    const message = "Short message"
    expect(truncateMessage(message, 200)).toBe(message)
  })

  it("returns message unchanged when exactly maxLength", () => {
    const message = "x".repeat(200)
    expect(truncateMessage(message, 200)).toBe(message)
  })

  it("truncates message and adds ellipsis when longer than maxLength", () => {
    const message = "x".repeat(250)
    const result = truncateMessage(message, 200)
    expect(result).toHaveLength(203) // 200 chars + "..."
    expect(result.endsWith("...")).toBe(true)
  })

  it("uses default maxLength of 200", () => {
    const message = "x".repeat(250)
    const result = truncateMessage(message)
    expect(result).toHaveLength(203)
  })

  it("handles empty string", () => {
    expect(truncateMessage("")).toBe("")
  })

  it("handles single character", () => {
    expect(truncateMessage("x")).toBe("x")
  })

  it("handles custom maxLength", () => {
    const message = "This is a test message"
    const result = truncateMessage(message, 10)
    expect(result).toBe("This is a ...")
    expect(result).toHaveLength(13)
  })

  it("handles very short maxLength", () => {
    const message = "Hello World"
    const result = truncateMessage(message, 3)
    expect(result).toBe("Hel...")
  })

  it("handles maxLength of 0", () => {
    const message = "Hello"
    const result = truncateMessage(message, 0)
    expect(result).toBe("...")
  })
})
