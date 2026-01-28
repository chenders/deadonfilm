import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { useDebouncedSearchParam } from "./useDebouncedSearchParam"

const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

// Helper to wrap hook with router
function wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter future={routerFutureConfig}>{children}</BrowserRouter>
}

describe("useDebouncedSearchParam", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset URL
    window.history.pushState({}, "", "/")
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns empty string when no search param in URL", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    const [inputValue, , urlValue] = result.current
    expect(inputValue).toBe("")
    expect(urlValue).toBe("")
  })

  it("initializes from URL search param", () => {
    window.history.pushState({}, "", "/?search=test")

    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    const [inputValue, , urlValue] = result.current
    expect(inputValue).toBe("test")
    expect(urlValue).toBe("test")
  })

  it("updates input value immediately", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    act(() => {
      result.current[1]("new value")
    })

    expect(result.current[0]).toBe("new value")
  })

  it("debounces URL update", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    act(() => {
      result.current[1]("debounced")
    })

    // Input updated immediately
    expect(result.current[0]).toBe("debounced")
    // URL not updated yet
    expect(window.location.search).toBe("")

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Now URL should be updated
    expect(window.location.search).toBe("?search=debounced")
  })

  it("uses custom debounce delay", () => {
    const { result } = renderHook(() => useDebouncedSearchParam({ debounceMs: 500 }), { wrapper })

    act(() => {
      result.current[1]("custom delay")
    })

    // Advance 300ms - not enough
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(window.location.search).toBe("")

    // Advance remaining 200ms
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(window.location.search).toBe("?search=custom+delay")
  })

  it("uses custom param name", () => {
    const { result } = renderHook(() => useDebouncedSearchParam({ paramName: "q" }), { wrapper })

    act(() => {
      result.current[1]("query")
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(window.location.search).toBe("?q=query")
  })

  it("removes param when value is empty", () => {
    window.history.pushState({}, "", "/?search=existing")

    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    act(() => {
      result.current[1]("")
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(window.location.search).toBe("")
  })

  it("resets page param when search changes by default", () => {
    window.history.pushState({}, "", "/?page=5")

    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    act(() => {
      result.current[1]("new search")
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(window.location.search).toBe("?search=new+search")
    expect(window.location.search).not.toContain("page")
  })

  it("preserves page param when resetPageOnChange is false", () => {
    window.history.pushState({}, "", "/?page=5")

    const { result } = renderHook(() => useDebouncedSearchParam({ resetPageOnChange: false }), {
      wrapper,
    })

    act(() => {
      result.current[1]("new search")
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(window.location.search).toContain("page=5")
    expect(window.location.search).toContain("search=new+search")
  })

  it("cancels pending debounce on new input", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    act(() => {
      result.current[1]("first")
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    act(() => {
      result.current[1]("second")
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Should only have "second", not "first"
    expect(window.location.search).toBe("?search=second")
  })

  it("debouncedValue (third return value) does not change during debounce period", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    // Get the initial debounced value
    const initialDebouncedValue = result.current[2]
    expect(initialDebouncedValue).toBe("")

    // Type a value
    act(() => {
      result.current[1]("test")
    })

    // Input value should be updated immediately
    expect(result.current[0]).toBe("test")

    // But debounced value should still be empty (URL hasn't updated yet)
    expect(result.current[2]).toBe("")

    // Advance time but not enough for debounce to complete
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Debounced value should still be empty
    expect(result.current[2]).toBe("")

    // Complete the debounce
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Now the debounced value should be updated
    expect(result.current[2]).toBe("test")
    expect(window.location.search).toBe("?search=test")
  })

  it("multiple rapid changes only result in one final debounced value", () => {
    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    // Simulate rapid typing
    act(() => {
      result.current[1]("a")
    })
    act(() => {
      result.current[1]("ab")
    })
    act(() => {
      result.current[1]("abc")
    })
    act(() => {
      result.current[1]("abcd")
    })

    // Input value should be the latest
    expect(result.current[0]).toBe("abcd")

    // Debounced value should still be empty
    expect(result.current[2]).toBe("")

    // Complete the debounce
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Now debounced value should be the final input
    expect(result.current[2]).toBe("abcd")
    expect(window.location.search).toBe("?search=abcd")
  })

  it("does not overwrite continued typing when URL updates from debounce", () => {
    // This tests a specific bug where typing "test" slowly would:
    // 1. Type "t", wait 300ms, URL updates to ?search=t
    // 2. The sync effect would overwrite inputValue back to "t"
    // 3. User's continued typing ("est") would be lost

    const { result } = renderHook(() => useDebouncedSearchParam(), { wrapper })

    // Type "t"
    act(() => {
      result.current[1]("t")
    })

    // Input should be "t"
    expect(result.current[0]).toBe("t")
    expect(window.location.search).toBe("")

    // Advance time so debounce fires for "t"
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // URL should now have "t"
    expect(window.location.search).toBe("?search=t")

    // Simulate user continuing to type AFTER url updated
    // This is the key scenario - user typed more while debounce was processing
    act(() => {
      result.current[1]("test")
    })

    // CRITICAL: Input should be "test", not reset to "t"
    expect(result.current[0]).toBe("test")

    // URL still has "t" (new debounce hasn't fired yet)
    expect(window.location.search).toBe("?search=t")

    // Now let the new debounce fire
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // URL should now have "test"
    expect(window.location.search).toBe("?search=test")
    expect(result.current[0]).toBe("test")
  })
})
