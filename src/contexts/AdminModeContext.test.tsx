import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { AdminModeProvider, useAdminMode } from "./AdminModeContext"
import { AdminAuthProvider } from "@/hooks/useAdminAuth"
import { ReactNode } from "react"

describe("AdminModeContext", () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    mockFetch?.mockRestore()
  })

  function createWrapper(authenticated: boolean) {
    // Mock fetch to return auth status
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ authenticated }),
      } as Response)
    )

    return ({ children }: { children: ReactNode }) => (
      <AdminAuthProvider>
        <AdminModeProvider>{children}</AdminModeProvider>
      </AdminAuthProvider>
    )
  }

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      renderHook(() => useAdminMode())
    }).toThrow("useAdminMode must be used within AdminModeProvider")

    consoleError.mockRestore()
  })

  it("defaults to false when no localStorage value", async () => {
    const wrapper = createWrapper(true)
    const { result } = renderHook(() => useAdminMode(), { wrapper })

    // Even if stored is false and authenticated, adminModeEnabled = false
    expect(result.current.adminModeEnabled).toBe(false)
  })

  it("toggles admin mode and persists to localStorage", async () => {
    const wrapper = createWrapper(true)
    const { result } = renderHook(() => useAdminMode(), { wrapper })

    act(() => {
      result.current.toggleAdminMode()
    })

    expect(localStorage.getItem("dof-admin-mode")).toBe("true")

    act(() => {
      result.current.toggleAdminMode()
    })

    expect(localStorage.getItem("dof-admin-mode")).toBe("false")
  })

  it("reads initial value from localStorage", () => {
    localStorage.setItem("dof-admin-mode", "true")
    const wrapper = createWrapper(true)
    const { result } = renderHook(() => useAdminMode(), { wrapper })

    // stored=true, but auth may not have resolved yet, so test the toggle
    act(() => {
      result.current.toggleAdminMode()
    })
    expect(localStorage.getItem("dof-admin-mode")).toBe("false")
  })

  it("returns false when not authenticated even if localStorage is true", () => {
    localStorage.setItem("dof-admin-mode", "true")
    const wrapper = createWrapper(false)
    const { result } = renderHook(() => useAdminMode(), { wrapper })

    expect(result.current.adminModeEnabled).toBe(false)
  })
})
