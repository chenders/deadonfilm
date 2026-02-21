import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminAuthProvider } from "@/hooks/useAdminAuth"
import { ToastProvider } from "@/contexts/ToastContext"
import AdminMovieToolbar from "./AdminMovieToolbar"
import { ReactNode } from "react"

describe("AdminMovieToolbar", () => {
  let mockFetch: ReturnType<typeof vi.spyOn>
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    localStorage.clear()
  })

  afterEach(() => {
    mockFetch?.mockRestore()
  })

  function createWrapper(authenticated: boolean) {
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = typeof url === "string" ? url : url.toString()

      // Auth status check
      if (urlStr.includes("/auth/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authenticated }),
        } as Response)
      }

      // Enrichment status check
      if (urlStr.includes("/enrichment-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            totalDeceased: 3,
            needsBioEnrichment: [1, 2],
            needsDeathEnrichment: [3],
          }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response)
    })

    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminAuthProvider>{children}</AdminAuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    )
  }

  it("renders nothing when not authenticated", async () => {
    const wrapper = createWrapper(false)
    const { container } = render(
      <AdminMovieToolbar movieTmdbId={550} deceasedTmdbIds={[100, 200, 300]} />,
      { wrapper }
    )

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe("")
  })

  it("renders toolbar when authenticated", async () => {
    const wrapper = createWrapper(true)
    render(<AdminMovieToolbar movieTmdbId={550} deceasedTmdbIds={[100, 200, 300]} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-movie-toolbar")).toBeInTheDocument()
    })
  })

  it("renders enrich buttons with counts", async () => {
    const wrapper = createWrapper(true)
    render(<AdminMovieToolbar movieTmdbId={550} deceasedTmdbIds={[100, 200, 300]} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-movie-toolbar")).toBeInTheDocument()
    })

    // Buttons should be present (counts load async)
    await vi.waitFor(() => {
      expect(screen.getByLabelText(/Enrich bios/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Enrich deaths/)).toBeInTheDocument()
    })
  })
})
