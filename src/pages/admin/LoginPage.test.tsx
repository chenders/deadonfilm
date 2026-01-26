import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { Routes, Route } from "react-router-dom"
import { TestMemoryRouter } from "@/test/test-utils"
import LoginPage from "./LoginPage"
import { AdminAuthProvider } from "../../hooks/useAdminAuth"

describe("LoginPage", () => {
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

  function renderLoginPage() {
    // Mock initial auth check (unauthenticated)
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response)
    )

    return render(
      <TestMemoryRouter initialEntries={["/admin/login"]}>
        <AdminAuthProvider>
          <Routes>
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin/dashboard" element={<div>Dashboard Page</div>} />
          </Routes>
        </AdminAuthProvider>
      </TestMemoryRouter>
    )
  }

  it("renders login form", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /admin login/i })).toBeInTheDocument()
    })

    expect(screen.getByText("Enter your admin password to continue")).toBeInTheDocument()
    expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    expect(screen.getByTestId("admin-login-submit")).toBeInTheDocument()
  })

  it("allows typing in password field", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    const passwordInput = screen.getByTestId("admin-login-password") as HTMLInputElement
    fireEvent.change(passwordInput, { target: { value: "test-password" } })

    expect(passwordInput.value).toBe("test-password")
  })

  it("successfully logs in and navigates to dashboard", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // Mock successful login
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
    )

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "correct-password" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText("Dashboard Page")).toBeInTheDocument()
    })
  })

  it("displays error message on failed login", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // Mock failed login
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: "Invalid password" } }),
      } as Response)
    )

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "wrong-password" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid password")
    })
  })

  it("shows loading state during login", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // Mock login that takes time
    let resolveLogin: (value: unknown) => void
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        })
    )

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "password" } })
    fireEvent.click(submitButton)

    // Check loading state
    await waitFor(() => {
      expect(submitButton).toHaveTextContent("Logging in...")
      expect(submitButton).toBeDisabled()
      expect(passwordInput).toBeDisabled()
    })

    // Resolve the login
    resolveLogin!({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  it("clears error when submitting again", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // First attempt - failed
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: "Invalid password" } }),
      } as Response)
    )

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "wrong" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid password")
    })

    // Second attempt - should clear error
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
    )

    fireEvent.change(passwordInput, { target: { value: "correct" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
  })

  it("handles network error gracefully", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // Mock network error
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error("Network error")))

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "password" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.")
    })

    consoleError.mockRestore()
  })

  it("submits form on Enter key", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    // Mock successful login
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)
    )

    const passwordInput = screen.getByTestId("admin-login-password")
    const submitButton = screen.getByTestId("admin-login-submit")

    fireEvent.change(passwordInput, { target: { value: "password" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/admin/api/auth/login",
        expect.objectContaining({
          method: "POST",
        })
      )
    })
  })

  it("requires password to be filled", () => {
    renderLoginPage()

    const passwordInput = screen.getByTestId("admin-login-password")
    expect(passwordInput).toHaveAttribute("required")
  })

  it("toggles password visibility when eye icon is clicked", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    const passwordInput = screen.getByTestId("admin-login-password") as HTMLInputElement
    const toggleButton = screen.getByTestId("password-toggle")

    // Initially password should be hidden
    expect(passwordInput.type).toBe("password")

    // Click to show password
    fireEvent.click(toggleButton)
    expect(passwordInput.type).toBe("text")

    // Click again to hide password
    fireEvent.click(toggleButton)
    expect(passwordInput.type).toBe("password")
  })

  it("has proper aria-label on password toggle button", async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-password")).toBeInTheDocument()
    })

    const toggleButton = screen.getByTestId("password-toggle")

    // Initially should say "Show password"
    expect(toggleButton).toHaveAttribute("aria-label", "Show password")

    // After clicking, should say "Hide password"
    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute("aria-label", "Hide password")
  })
})
