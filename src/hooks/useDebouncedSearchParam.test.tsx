import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { useDebouncedSearchParam } from "./useDebouncedSearchParam"

// Helper to wrap hook with router
function wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>
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
})
