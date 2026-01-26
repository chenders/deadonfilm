import { useState, FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"
import { AdminThemeProvider } from "../../contexts/AdminThemeContext"
import { ThemeToggle } from "../../components/admin/ThemeToggle"
import EyeIcon from "../../components/icons/EyeIcon"

function LoginPageContent() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAdminAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const result = await login(password)

      if (result.success) {
        navigate("/admin/dashboard")
      } else {
        setError(result.error || "Login failed")
      }
    } catch (err) {
      console.error("Admin login failed:", err)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="admin-layout flex min-h-screen items-center justify-center bg-admin-surface-base px-4">
      {/* Theme toggle in top right */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-admin-text-primary">
            Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-admin-text-muted">
            Enter your admin password to continue
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-admin-sm">
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full appearance-none rounded-md border border-admin-border bg-admin-surface-elevated px-3 py-2 pr-10 text-admin-text-primary placeholder-admin-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-admin-interactive"
                placeholder="Password"
                disabled={isLoading}
                data-testid="admin-login-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-admin-text-muted hover:text-admin-text-secondary"
                aria-label={showPassword ? "Hide password" : "Show password"}
                data-testid="password-toggle"
              >
                <EyeIcon visible={showPassword} />
              </button>
            </div>
          </div>

          {error && (
            <div className="text-center text-sm text-admin-danger" role="alert">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-admin-interactive px-4 py-2 text-sm font-medium text-admin-text-inverse hover:bg-admin-interactive-hover focus:outline-none focus:ring-2 focus:ring-admin-interactive focus:ring-offset-2 focus:ring-offset-admin-surface-base disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="admin-login-submit"
            >
              {isLoading ? "Logging in..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AdminThemeProvider>
      <LoginPageContent />
    </AdminThemeProvider>
  )
}
