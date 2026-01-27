import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import AdminNav from "./AdminNav"
import { AdminAuthProvider } from "../../hooks/useAdminAuth"
import { AdminThemeProvider } from "../../contexts/AdminThemeContext"

describe("AdminNav", () => {
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

  function renderWithRouter(initialPath = "/admin/dashboard") {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ authenticated: true }),
      } as Response)
    )

    return render(
      <TestMemoryRouter initialEntries={[initialPath]}>
        <AdminAuthProvider>
          <AdminThemeProvider>
            <AdminNav />
          </AdminThemeProvider>
        </AdminAuthProvider>
      </TestMemoryRouter>
    )
  }

  it("renders site title and admin panel label", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText("Dead on Film")).toBeInTheDocument()
    })

    expect(screen.getByText("Admin Panel")).toBeInTheDocument()
  })

  it("renders dashboard navigation link", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    })

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
    expect(dashboardLink).toHaveAttribute("href", "/admin/dashboard")
  })

  it("renders background jobs navigation link", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /background jobs/i })).toBeInTheDocument()
    })

    const jobsLink = screen.getByRole("link", { name: /background jobs/i })
    expect(jobsLink).toHaveAttribute("href", "/admin/jobs")
  })

  it("renders data quality navigation link", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /data quality/i })).toBeInTheDocument()
    })

    const dataQualityLink = screen.getByRole("link", { name: /data quality/i })
    expect(dataQualityLink).toHaveAttribute("href", "/admin/data-quality")
  })

  it("renders TMDB sync navigation link", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /tmdb sync/i })).toBeInTheDocument()
    })

    const syncLink = screen.getByRole("link", { name: /tmdb sync/i })
    expect(syncLink).toHaveAttribute("href", "/admin/sync")
  })

  it("highlights active route", async () => {
    renderWithRouter("/admin/dashboard")

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    })

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
    expect(dashboardLink).toHaveClass("bg-admin-surface-base", "text-admin-text-primary")
  })

  it("does not highlight inactive route", async () => {
    renderWithRouter("/admin/other-page")

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    })

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
    expect(dashboardLink).toHaveClass("text-admin-text-secondary")
    expect(dashboardLink).not.toHaveClass("bg-admin-surface-base")
  })

  it("renders logout button", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByTestId("admin-logout-button")).toBeInTheDocument()
    })

    const logoutButton = screen.getByTestId("admin-logout-button")
    expect(logoutButton).toHaveTextContent("Logout")
  })

  it("calls logout function when logout button clicked", async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByTestId("admin-logout-button")).toBeInTheDocument()
    })

    // Mock logout endpoint
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
      } as Response)
    )

    const logoutButton = screen.getByTestId("admin-logout-button")
    fireEvent.click(logoutButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    })
  })

  it("has correct nav styling", async () => {
    const { container } = renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText("Dead on Film")).toBeInTheDocument()
    })

    const nav = container.querySelector("nav")
    expect(nav).toHaveClass(
      "min-h-screen",
      "w-64",
      "border-r",
      "border-admin-border",
      "bg-admin-surface-elevated"
    )
  })
})
