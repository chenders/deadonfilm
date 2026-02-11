import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminAuthProvider } from "@/hooks/useAdminAuth"
import { AdminModeProvider } from "@/contexts/AdminModeContext"
import { ToastProvider } from "@/contexts/ToastContext"
import AdminActorMetadata from "./AdminActorMetadata"
import { ReactNode } from "react"

describe("AdminActorMetadata", () => {
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

  function createWrapper(authenticated: boolean, adminMode: boolean) {
    if (adminMode) {
      localStorage.setItem("dof-admin-mode", "true")
    }

    const metadataResponse = {
      actorId: 123,
      biography: {
        hasContent: true,
        generatedAt: "2026-01-15T00:00:00Z",
        sourceType: "tmdb",
      },
      enrichment: {
        enrichedAt: "2026-01-20T00:00:00Z",
        source: "multi-source",
        causeOfDeathSource: "claude",
        hasCircumstances: true,
        circumstancesEnrichedAt: "2026-01-20T00:00:00Z",
      },
      dataQuality: {
        hasDetailedDeathInfo: true,
        isObscure: false,
        deathdayConfidence: "verified",
      },
      adminEditorUrl: "/admin/actors/123",
    }

    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = typeof url === "string" ? url : url.toString()
      if (urlStr.includes("/auth/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authenticated }),
        } as Response)
      }
      if (urlStr.includes("/metadata")) {
        return Promise.resolve({
          ok: true,
          json: async () => metadataResponse,
        } as Response)
      }
      return Promise.resolve({ ok: false } as Response)
    })

    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminAuthProvider>
            <AdminModeProvider>{children}</AdminModeProvider>
          </AdminAuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    )
  }

  it("renders nothing when not authenticated", async () => {
    const wrapper = createWrapper(false, false)
    const { container } = render(<AdminActorMetadata actorId={123} />, { wrapper })

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe("")
  })

  it("renders nothing when admin mode is off", async () => {
    const wrapper = createWrapper(true, false)
    const { container } = render(<AdminActorMetadata actorId={123} />, { wrapper })

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    expect(screen.queryByTestId("admin-actor-metadata")).not.toBeInTheDocument()
    expect(container.innerHTML).toBe("")
  })

  it("renders metadata when authenticated and admin mode is on", async () => {
    const wrapper = createWrapper(true, true)
    render(<AdminActorMetadata actorId={123} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-actor-metadata")).toBeInTheDocument()
    })

    expect(screen.getByText(/Bio:/)).toBeInTheDocument()
    expect(screen.getByText(/Enrichment:/)).toBeInTheDocument()
    expect(screen.getByText(/CoD Source:/)).toBeInTheDocument()
    expect(screen.getByText(/Circumstances:/)).toBeInTheDocument()
  })

  it("shows correct enrichment source", async () => {
    const wrapper = createWrapper(true, true)
    render(<AdminActorMetadata actorId={123} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-actor-metadata")).toBeInTheDocument()
    })

    expect(screen.getByText(/claude/)).toBeInTheDocument()
  })
})
