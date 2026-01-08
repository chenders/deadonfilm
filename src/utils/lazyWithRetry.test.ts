import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { lazyWithRetry } from "./lazyWithRetry"

describe("lazyWithRetry", () => {
  const mockReload = vi.fn()
  let originalLocation: Location
  let sessionStorageData: Record<string, string>

  beforeEach(() => {
    // Mock window.location.reload
    originalLocation = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: mockReload },
    })

    // Mock sessionStorage
    sessionStorageData = {}
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key) => sessionStorageData[key] || null
    )
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      sessionStorageData[key] = value
    })
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => {
      delete sessionStorageData[key]
    })

    mockReload.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
  })

  it("returns a lazy component that resolves successfully", async () => {
    const mockComponent = () => null
    const importFn = vi.fn().mockResolvedValue({ default: mockComponent })

    const LazyComponent = lazyWithRetry(importFn)

    // Access the internal loader to test it
    // React.lazy stores the loader, we can test by accessing _payload
    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    // Trigger the lazy load
    try {
      init(payload)
    } catch {
      // React.lazy throws a promise on first call, that's expected
    }

    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect(importFn).toHaveBeenCalled()
    })

    expect(mockReload).not.toHaveBeenCalled()
    expect(sessionStorageData["chunk_reload_count"]).toBeUndefined()
  })

  it("triggers reload on chunk loading error", async () => {
    const chunkError = new Error(
      "Failed to fetch dynamically imported module: https://example.com/chunk.js"
    )
    const importFn = vi.fn().mockRejectedValue(chunkError)

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    try {
      init(payload)
    } catch {
      // Expected
    }

    await vi.waitFor(() => {
      expect(mockReload).toHaveBeenCalled()
    })

    expect(sessionStorageData["chunk_reload_count"]).toBe("1")
  })

  it("does not reload more than once per session", async () => {
    sessionStorageData["chunk_reload_count"] = "1"

    const chunkError = new Error(
      "Failed to fetch dynamically imported module: https://example.com/chunk.js"
    )
    const importFn = vi.fn().mockRejectedValue(chunkError)

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    let thrownError: Error | null = null
    try {
      init(payload)
      // Wait for the promise to reject
      await new Promise((resolve) => setTimeout(resolve, 50))
      init(payload)
    } catch (e) {
      thrownError = e as Error
    }

    // Should NOT reload since we've already retried
    expect(mockReload).not.toHaveBeenCalled()
    // Error should be re-thrown
    expect(thrownError).toBeTruthy()
  })

  it("does not reload for non-chunk errors", async () => {
    const regularError = new Error("Some other error")
    const importFn = vi.fn().mockRejectedValue(regularError)

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    // First call returns a promise that React.lazy throws
    try {
      init(payload)
    } catch {
      // Expected - React.lazy throws promise on first call
    }

    // Wait for the import to be attempted
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Second call should throw the actual error since import failed
    let thrownError: Error | null = null
    try {
      init(payload)
    } catch (e) {
      thrownError = e as Error
    }

    expect(mockReload).not.toHaveBeenCalled()
    expect(thrownError?.message).toBe("Some other error")
  })

  it("clears reload count on successful load", async () => {
    sessionStorageData["chunk_reload_count"] = "1"

    const mockComponent = () => null
    const importFn = vi.fn().mockResolvedValue({ default: mockComponent })

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    try {
      init(payload)
    } catch {
      // Expected
    }

    await vi.waitFor(() => {
      expect(importFn).toHaveBeenCalled()
    })

    // Give time for the sessionStorage to be cleared
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(sessionStorageData["chunk_reload_count"]).toBeUndefined()
  })

  it("handles ChunkLoadError by name", async () => {
    const chunkError = new Error("Loading chunk failed")
    chunkError.name = "ChunkLoadError"
    const importFn = vi.fn().mockRejectedValue(chunkError)

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    try {
      init(payload)
    } catch {
      // Expected
    }

    await vi.waitFor(() => {
      expect(mockReload).toHaveBeenCalled()
    })
  })

  it("handles 'Loading chunk' error message", async () => {
    const chunkError = new Error("Loading chunk 123 failed")
    const importFn = vi.fn().mockRejectedValue(chunkError)

    const LazyComponent = lazyWithRetry(importFn)

    const payload = (LazyComponent as any)._payload
    const init = (LazyComponent as any)._init

    try {
      init(payload)
    } catch {
      // Expected
    }

    await vi.waitFor(() => {
      expect(mockReload).toHaveBeenCalled()
    })
  })
})
