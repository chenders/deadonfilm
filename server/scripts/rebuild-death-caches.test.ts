import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the dependencies
vi.mock("../src/lib/redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/lib/cache.js", () => ({
  rebuildDeathCaches: vi.fn().mockResolvedValue(undefined),
}))

import { initRedis, closeRedis } from "../src/lib/redis.js"
import { rebuildDeathCaches } from "../src/lib/cache.js"

describe("rebuild-death-caches script", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("successfully rebuilds caches when Redis is available", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const { default: main } = await import("./rebuild-death-caches.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(initRedis).toHaveBeenCalledOnce()
    expect(rebuildDeathCaches).toHaveBeenCalledOnce()
    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("exits with error when Redis is unavailable", async () => {
    vi.mocked(initRedis).mockResolvedValue(false)

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    const { default: main } = await import("./rebuild-death-caches.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(initRedis).toHaveBeenCalledOnce()
    expect(rebuildDeathCaches).not.toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it("calls closeRedis in finally block even when rebuildDeathCaches succeeds", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const { default: main } = await import("./rebuild-death-caches.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("calls closeRedis in finally block even when rebuildDeathCaches throws", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)
    vi.mocked(rebuildDeathCaches).mockRejectedValue(new Error("Cache rebuild failed"))

    const { default: main } = await import("./rebuild-death-caches.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("Cache rebuild failed")

    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("logs error message when Redis is unavailable", async () => {
    vi.mocked(initRedis).mockResolvedValue(false)

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    const { default: main } = await import("./rebuild-death-caches.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Redis is not available")

    consoleErrorSpy.mockRestore()
    mockExit.mockRestore()
  })
})
