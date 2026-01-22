import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import AdminLayout from "./AdminLayout"
import { AdminAuthProvider } from "../../hooks/useAdminAuth"

// Mock AdminNav component
vi.mock("./AdminNav", () => ({
  default: () => <nav data-testid="admin-nav">Admin Navigation</nav>,
}))

// Mock LoadingSpinner component
vi.mock("../common/LoadingSpinner", () => ({
  default: () => <div data-testid="loading-spinner">Loading...</div>,
}))

describe("AdminLayout", () => {
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

  function renderWithRouter(
    children: React.ReactElement,
    initialPath = "/admin/dashboard",
    authenticatedStatus = { authenticated: true }
  ) {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => authenticatedStatus,
      } as Response)
    )

    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <AdminAuthProvider>
          <Routes>
            <Route path="/admin/login" element={<div>Login Page</div>} />
            <Route path="/admin/dashboard" element={children} />
          </Routes>
        </AdminAuthProvider>
      </MemoryRouter>
    )
  }

  it("shows loading spinner while checking authentication", () => {
    renderWithRouter(
      <AdminLayout>
        <div>Dashboard Content</div>
      </AdminLayout>
    )

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
  })

  it("renders children and navigation when authenticated", async () => {
    renderWithRouter(
      <AdminLayout>
        <div data-testid="dashboard-content">Dashboard Content</div>
      </AdminLayout>
    )

    await waitFor(() => {
      expect(screen.getByTestId("admin-nav")).toBeInTheDocument()
    })

    expect(screen.getByTestId("dashboard-content")).toBeInTheDocument()
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument()
  })

  it("redirects to login page when not authenticated", async () => {
    renderWithRouter(
      <AdminLayout>
        <div>Dashboard Content</div>
      </AdminLayout>,
      "/admin/dashboard",
      { authenticated: false }
    )

    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument()
    })

    expect(screen.queryByTestId("admin-nav")).not.toBeInTheDocument()
  })

  it("returns null before redirect completes", async () => {
    renderWithRouter(
      <AdminLayout>
        <div>Dashboard Content</div>
      </AdminLayout>,
      "/admin/dashboard",
      { authenticated: false }
    )

    // Initially shows loading
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()

    // Then briefly returns null before redirect
    await waitFor(() => {
      expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument()
    })

    // Finally shows login page after redirect
    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument()
    })
  })

  it("renders with correct layout structure", async () => {
    const { container } = renderWithRouter(
      <AdminLayout>
        <div data-testid="test-content">Test Content</div>
      </AdminLayout>
    )

    await waitFor(() => {
      expect(screen.getByTestId("admin-nav")).toBeInTheDocument()
    })

    // Check for layout structure
    const main = container.querySelector("main")
    expect(main).toBeInTheDocument()
    expect(main).toHaveClass("flex-1", "p-8")

    const contentWrapper = main?.querySelector("div")
    expect(contentWrapper).toHaveClass("mx-auto", "max-w-7xl")
  })
})
