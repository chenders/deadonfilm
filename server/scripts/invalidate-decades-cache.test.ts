import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the dependencies
vi.mock("../src/lib/cache.js", () => ({
  invalidateKeys: vi.fn().mockResolvedValue(undefined),
  CACHE_PREFIX: {
    DECADES: "decades",
  },
}))

vi.mock("../src/lib/redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}))

import { invalidateKeys, CACHE_PREFIX } from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"

describe("invalidate-decades-cache script", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("successfully invalidates cache when Redis is available", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    // Import and run the main function
    const { default: main } = await import("./invalidate-decades-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(initRedis).toHaveBeenCalledOnce()
    expect(invalidateKeys).toHaveBeenCalledWith(CACHE_PREFIX.DECADES)
    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("exits with error when Redis is unavailable", async () => {
    vi.mocked(initRedis).mockResolvedValue(false)

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    // Import and run the main function
    const { default: main } = await import("./invalidate-decades-cache.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(initRedis).toHaveBeenCalledOnce()
    expect(invalidateKeys).not.toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it("calls invalidateKeys with correct cache prefix", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const { default: main } = await import("./invalidate-decades-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(invalidateKeys).toHaveBeenCalledWith("decades")
  })

  it("logs error message when Redis is unavailable", async () => {
    vi.mocked(initRedis).mockResolvedValue(false)

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    const { default: main } = await import("./invalidate-decades-cache.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Redis is not available. Cannot invalidate decades cache."
    )

    consoleErrorSpy.mockRestore()
    mockExit.mockRestore()
  })
})
