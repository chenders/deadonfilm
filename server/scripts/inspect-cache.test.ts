import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the dependencies
vi.mock("../src/lib/redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
}))

vi.mock("../src/lib/cache.js", () => ({
  CACHE_PREFIX: {
    RECENT_DEATHS: "recent-deaths",
  },
  buildCacheKey: vi.fn(
    (prefix: string, params: { limit: number }) => `${prefix}:limit:${params.limit}`
  ),
}))

import { initRedis, closeRedis, getRedisClient } from "../src/lib/redis.js"
import { CACHE_PREFIX } from "../src/lib/cache.js"

describe("inspect-cache script", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("successfully inspects cache when Redis is available with keys", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const mockClient = {
      keys: vi.fn().mockResolvedValue(["recent-deaths:limit:8", "recent-deaths:limit:10"]),
      ttl: vi.fn().mockResolvedValue(3600),
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          deaths: [
            { name: "Actor One", deathday: "2024-01-15" },
            { name: "Actor Two", deathday: "2024-01-14" },
          ],
        })
      ),
      exists: vi.fn().mockResolvedValue(1),
    } as any

    vi.mocked(getRedisClient).mockReturnValue(mockClient)

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(initRedis).toHaveBeenCalledOnce()
    expect(getRedisClient).toHaveBeenCalled()
    expect(mockClient.keys).toHaveBeenCalledWith(`${CACHE_PREFIX.RECENT_DEATHS}:*`)
    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("handles empty cache gracefully", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const mockClient = {
      keys: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(0),
    } as unknown as any

    vi.mocked(getRedisClient).mockReturnValue(mockClient)

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith("❌ No recent-deaths cache keys found")
    expect(closeRedis).toHaveBeenCalledOnce()

    consoleLogSpy.mockRestore()
  })

  it("handles invalid JSON data structure", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const mockClient = {
      keys: vi.fn().mockResolvedValue(["recent-deaths:limit:8"]),
      ttl: vi.fn().mockResolvedValue(3600),
      get: vi.fn().mockResolvedValue(JSON.stringify({ invalid: "structure" })),
      exists: vi.fn().mockResolvedValue(1),
    } as unknown as any

    vi.mocked(getRedisClient).mockReturnValue(mockClient)

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("⚠️  Invalid data structure:"),
      expect.any(Object)
    )
    expect(closeRedis).toHaveBeenCalledOnce()

    consoleLogSpy.mockRestore()
  })

  it("exits with error when Redis is unavailable", async () => {
    vi.mocked(initRedis).mockResolvedValue(false)

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(initRedis).toHaveBeenCalledOnce()
    expect(getRedisClient).not.toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it("exits with error when Redis client is null", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)
    vi.mocked(getRedisClient).mockReturnValue(null)

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("process.exit called")

    expect(getRedisClient).toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })

  it("calls closeRedis in finally block", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const mockClient = {
      keys: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(0),
    } as unknown as any

    vi.mocked(getRedisClient).mockReturnValue(mockClient)

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(closeRedis).toHaveBeenCalledOnce()
  })

  it("handles keys with empty deaths array", async () => {
    vi.mocked(initRedis).mockResolvedValue(true)

    const mockClient = {
      keys: vi.fn().mockResolvedValue(["recent-deaths:limit:8"]),
      ttl: vi.fn().mockResolvedValue(3600),
      get: vi.fn().mockResolvedValue(JSON.stringify({ deaths: [] })),
      exists: vi.fn().mockResolvedValue(1),
    } as unknown as any

    vi.mocked(getRedisClient).mockReturnValue(mockClient)

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./inspect-cache.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⚠️  EMPTY ARRAY"))
    expect(closeRedis).toHaveBeenCalledOnce()

    consoleLogSpy.mockRestore()
  })
})
