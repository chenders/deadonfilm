import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import { useTabParam } from "./useTabParam"

function wrapper({ children }: { children: React.ReactNode }) {
  return <TestMemoryRouter>{children}</TestMemoryRouter>
}

function wrapperWithInitialEntry(entry: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <TestMemoryRouter initialEntries={[entry]}>{children}</TestMemoryRouter>
  }
}

describe("useTabParam", () => {
  it("returns the default tab when no search param is present", () => {
    const { result } = renderHook(() => useTabParam("overview"), { wrapper })
    expect(result.current[0]).toBe("overview")
  })

  it("reads the tab from the URL search param", () => {
    const { result } = renderHook(() => useTabParam("overview"), {
      wrapper: wrapperWithInitialEntry("/admin/actors?tab=diagnostic"),
    })
    expect(result.current[0]).toBe("diagnostic")
  })

  it("updates the URL when setActiveTab is called", () => {
    const { result } = renderHook(() => useTabParam<string>("overview"), { wrapper })

    act(() => {
      result.current[1]("diagnostic")
    })

    expect(result.current[0]).toBe("diagnostic")
  })

  it("removes the param when set to the default tab", () => {
    const { result } = renderHook(() => useTabParam("overview"), {
      wrapper: wrapperWithInitialEntry("/admin?tab=diagnostic"),
    })

    expect(result.current[0]).toBe("diagnostic")

    act(() => {
      result.current[1]("overview")
    })

    expect(result.current[0]).toBe("overview")
  })

  it("supports custom param names", () => {
    const { result } = renderHook(() => useTabParam("tab1", "section"), {
      wrapper: wrapperWithInitialEntry("/admin?section=tab2"),
    })
    expect(result.current[0]).toBe("tab2")
  })
})
