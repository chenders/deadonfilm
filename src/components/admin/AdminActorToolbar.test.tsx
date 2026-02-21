import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminAuthProvider } from "@/hooks/useAdminAuth"
import { AdminModeProvider } from "@/contexts/AdminModeContext"
import { ToastProvider } from "@/contexts/ToastContext"
import AdminActorToolbar from "./AdminActorToolbar"
import { ReactNode } from "react"

const mockMetadata = {
  actorId: 123,
  biography: {
    hasContent: true,
    generatedAt: "2026-01-15T00:00:00Z",
    sourceType: "claude",
    hasEnrichedBio: true,
    bioEnrichedAt: "2026-01-20T00:00:00Z",
  },
  enrichment: {
    enrichedAt: "2026-01-10T00:00:00Z",
    source: "multi-source-enrichment",
    version: "3.0.0",
    causeOfDeathSource: "wikipedia",
    hasCircumstances: true,
    circumstancesEnrichedAt: "2026-01-10T00:00:00Z",
  },
  dataQuality: {
    hasDetailedDeathInfo: true,
    isObscure: false,
    deathdayConfidence: "day",
  },
  adminEditorUrl: "/admin/actors/123",
}

describe("AdminActorToolbar", () => {
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
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      // Metadata endpoint
      if (url.includes("/metadata")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMetadata,
        } as Response)
      }
      // Auth check
      return Promise.resolve({
        ok: true,
        json: async () => ({ authenticated }),
      } as Response)
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
    const wrapper = createWrapper(false)
    const { container } = render(<AdminActorToolbar actorId={123} />, { wrapper })

    // Wait for auth check to resolve
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    expect(container.innerHTML).toBe("")
  })

  it("renders toolbar when authenticated", async () => {
    const wrapper = createWrapper(true)
    render(<AdminActorToolbar actorId={123} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-actor-toolbar")).toBeInTheDocument()
    })

    expect(screen.getByTestId("admin-mode-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("admin-editor-link")).toBeInTheDocument()
    expect(screen.getByLabelText("Regen bio")).toBeInTheDocument()
    expect(screen.getByLabelText("Re-enrich")).toBeInTheDocument()
    expect(screen.getByLabelText("Enrich bio")).toBeInTheDocument()
  })

  it("has correct admin editor link", async () => {
    const wrapper = createWrapper(true)
    render(<AdminActorToolbar actorId={456} />, { wrapper })

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-editor-link")).toBeInTheDocument()
    })

    expect(screen.getByTestId("admin-editor-link")).toHaveAttribute("href", "/admin/actors/456")
  })
})
