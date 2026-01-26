import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { AdminAuthProvider, useAdminAuth } from "./useAdminAuth"
import { ReactNode } from "react"

describe("useAdminAuth", () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
      } as Response)
    )
  })

  afterEach(() => {
    mockFetch.mockRestore()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AdminAuthProvider>{children}</AdminAuthProvider>
  )

  it("throws error when used outside AdminAuthProvider", () => {
    // Suppress console.error for this test
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      renderHook(() => useAdminAuth())
    }).toThrow("useAdminAuth must be used within AdminAuthProvider")

    consoleError.mockRestore()
  })

  describe("initial auth check", () => {
    it("checks auth status on mount", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: true }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/auth/status", {
        credentials: "include",
      })
      expect(result.current.isAuthenticated).toBe(true)
    })

    it("sets authenticated to false when status check fails", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isAuthenticated).toBe(false)
    })

    it("sets authenticated to false on network error", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")))

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isAuthenticated).toBe(false)
      consoleError.mockRestore()
    })
  })

  describe("login", () => {
    it("successfully logs in with correct password", async () => {
      // Mock initial auth check (unauthenticated)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Mock successful login
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        } as Response)
      )

      let loginResult
      await act(async () => {
        loginResult = await result.current.login("correct-password")
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ password: "correct-password" }),
      })
      expect(loginResult.success).toBe(true)
    })

    it("fails login with incorrect password", async () => {
      // Mock initial auth check
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Mock failed login
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: { message: "Invalid password" } }),
        } as Response)
      )

      const loginResult = await result.current.login("wrong-password")

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toBe("Invalid password")
      expect(result.current.isAuthenticated).toBe(false)
    })

    it("handles network error during login", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      // Mock initial auth check
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Mock network error
      mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")))

      const loginResult = await result.current.login("password")

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toBe("Network error. Please try again.")
      consoleError.mockRestore()
    })

    it("uses fallback error message when server returns no error", async () => {
      // Mock initial auth check
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Mock failed login with no error message
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({}),
        } as Response)
      )

      const loginResult = await result.current.login("password")

      expect(loginResult.success).toBe(false)
      expect(loginResult.error).toBe("Login failed")
    })
  })

  describe("logout", () => {
    it("clears authentication and calls logout endpoint", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      // Mock initial auth check (authenticated)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: true }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      // Mock logout
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
        } as Response)
      )

      await result.current.logout()

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })

      consoleError.mockRestore()
    })

    it("sets authenticated to false even if logout request fails", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      // Mock initial auth check (authenticated)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: true }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      // Mock logout failure
      mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")))

      await result.current.logout()

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false)
      })

      consoleError.mockRestore()
    })
  })

  describe("checkAuth", () => {
    it("can be called manually to re-check authentication", async () => {
      // Mock initial auth check
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response)
      )

      const { result } = renderHook(() => useAdminAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isAuthenticated).toBe(false)

      // Mock subsequent auth check (now authenticated)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: true }),
        } as Response)
      )

      await act(async () => {
        await result.current.checkAuth()
      })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })
    })
  })
})
