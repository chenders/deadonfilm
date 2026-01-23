import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePageViewTracking } from "./usePageViewTracking"

// Mock fetch globally
global.fetch = vi.fn()

describe("usePageViewTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("tracks page view with all required params", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
    } as Response)

    renderHook(() =>
      usePageViewTracking("movie", 123, "/movie/test-movie-2024-123")
    )

    // Wait for the 500ms delay + fetch to complete
    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/page-views/track",
          expect.objectContaining({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              pageType: "movie",
              entityId: 123,
              path: "/movie/test-movie-2024-123",
            }),
          })
        )
      },
      { timeout: 2000 }
    )
  })

  it("does not track when pageType is null", async () => {
    renderHook(() =>
      usePageViewTracking(null, 123, "/movie/test-movie-2024-123")
    )

    // Wait a bit to ensure it doesn't track
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(fetch).not.toHaveBeenCalled()
  })

  it("does not track when entityId is null", async () => {
    renderHook(() =>
      usePageViewTracking("movie", null, "/movie/test-movie-2024-123")
    )

    // Wait a bit to ensure it doesn't track
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(fetch).not.toHaveBeenCalled()
  })

  it("only tracks once per mount", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
    } as Response)

    const { rerender } = renderHook(
      ({ path }) => usePageViewTracking("movie", 123, path),
      {
        initialProps: { path: "/movie/test-1" },
      }
    )

    // Wait for first tracking
    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 1000 })

    // Rerender with different path
    rerender({ path: "/movie/test-2" })

    // Wait to ensure no second call
    await new Promise((resolve) => setTimeout(resolve, 600))

    // Should still only track once
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("delays tracking by 500ms", async () => {
    let fetchCallTime: number | null = null
    const startTime = Date.now()

    vi.mocked(fetch).mockImplementation(async () => {
      fetchCallTime = Date.now() - startTime
      return { ok: true } as Response
    })

    renderHook(() =>
      usePageViewTracking("show", 456, "/show/test-show-2020-456")
    )

    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 1000 })

    // Should have been called after ~500ms (allow some tolerance)
    expect(fetchCallTime).toBeGreaterThanOrEqual(450)
    expect(fetchCallTime).toBeLessThan(1000)
  })

  it("cancels tracking on unmount", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
    } as Response)

    const { unmount } = renderHook(() =>
      usePageViewTracking("episode", 789, "/episode/test-episode")
    )

    // Unmount immediately before delay completes
    unmount()

    // Wait to ensure no tracking call
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(fetch).not.toHaveBeenCalled()
  })

  it("silently handles fetch errors", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))

    // Should not throw error even when fetch fails
    renderHook(() =>
      usePageViewTracking("actor_death", 2157, "/death/john-doe-2157")
    )

    // Wait for fetch to be called
    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 1000 })

    // Give time for any errors to surface (they shouldn't)
    await new Promise((resolve) => setTimeout(resolve, 200))

    // If we got here without throwing, the silent error handling works
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("handles different page types", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
    } as Response)

    // Test each page type with a different entity ID
    const { unmount: unmount1 } = renderHook(() =>
      usePageViewTracking("movie", 1, "/test-movie")
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    const { unmount: unmount2 } = renderHook(() =>
      usePageViewTracking("show", 2, "/test-show")
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 1000 })

    const { unmount: unmount3 } = renderHook(() =>
      usePageViewTracking("episode", 3, "/test-episode")
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3), { timeout: 1000 })

    const { unmount: unmount4 } = renderHook(() =>
      usePageViewTracking("actor_death", 4, "/test-death")
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4), { timeout: 1000 })

    expect(fetch).toHaveBeenCalledTimes(4)

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.some((call) => call[1]?.body?.includes('"pageType":"movie"'))).toBe(
      true
    )
    expect(calls.some((call) => call[1]?.body?.includes('"pageType":"show"'))).toBe(
      true
    )
    expect(
      calls.some((call) => call[1]?.body?.includes('"pageType":"episode"'))
    ).toBe(true)
    expect(
      calls.some((call) => call[1]?.body?.includes('"pageType":"actor_death"'))
    ).toBe(true)

    unmount1()
    unmount2()
    unmount3()
    unmount4()
  })
})
