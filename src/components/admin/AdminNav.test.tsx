import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import AdminNav from "./AdminNav"
import { AdminAuthProvider } from "../../hooks/useAdminAuth"

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
      <MemoryRouter initialEntries={[initialPath]}>
        <AdminAuthProvider>
          <AdminNav />
        </AdminAuthProvider>
      </MemoryRouter>
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

  it("highlights active route", async () => {
    renderWithRouter("/admin/dashboard")

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    })

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
    expect(dashboardLink).toHaveClass("bg-gray-900", "text-white")
  })

  it("does not highlight inactive route", async () => {
    renderWithRouter("/admin/other-page")

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    })

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i })
    expect(dashboardLink).toHaveClass("text-gray-300", "hover:bg-gray-700", "hover:text-white")
    expect(dashboardLink).not.toHaveClass("bg-gray-900")
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
      "border-gray-700",
      "bg-gray-800",
      "p-4"
    )
  })
})
