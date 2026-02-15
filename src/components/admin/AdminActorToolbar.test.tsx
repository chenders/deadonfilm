import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminAuthProvider } from "@/hooks/useAdminAuth"
import { AdminModeProvider } from "@/contexts/AdminModeContext"
import { ToastProvider } from "@/contexts/ToastContext"
import AdminActorToolbar from "./AdminActorToolbar"
import { ReactNode } from "react"

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
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ authenticated }),
      } as Response)
    )

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
