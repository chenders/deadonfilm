import { Link, useLocation } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"
import { ThemeToggle } from "./ThemeToggle"

interface AdminNavProps {
  /** Callback when a navigation link is clicked (for closing mobile menu) */
  onNavigate?: () => void
}

interface NavLinkProps {
  to: string
  children: React.ReactNode
  isActive: boolean
  onClick?: () => void
}

function NavLink({ to, children, isActive, onClick }: NavLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block rounded-md px-4 py-2 text-sm font-medium transition-colors md:py-2 ${
        isActive
          ? "bg-admin-surface-base text-admin-text-primary"
          : "text-admin-text-secondary hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
      }`}
    >
      {children}
    </Link>
  )
}

export default function AdminNav({ onNavigate }: AdminNavProps) {
  const location = useLocation()
  const { logout } = useAdminAuth()

  const isActive = (path: string, exact = false) => {
    if (exact) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  const handleLogout = async () => {
    await logout()
  }

  return (
    <nav className="flex min-h-screen w-64 flex-col border-r border-admin-border bg-admin-surface-elevated">
      {/* Header */}
      <div className="border-b border-admin-border-subtle p-4">
        <h1 className="text-xl font-bold text-admin-text-primary">Dead on Film</h1>
        <p className="text-sm text-admin-text-muted">Admin Panel</p>
      </div>

      {/* Navigation links */}
      <div className="flex-1 space-y-1 overflow-y-auto p-4">
        <NavLink
          to="/admin/dashboard"
          isActive={isActive("/admin/dashboard", true)}
          onClick={onNavigate}
        >
          Dashboard
        </NavLink>

        <NavLink to="/admin/analytics" isActive={isActive("/admin/analytics")} onClick={onNavigate}>
          Analytics
        </NavLink>

        <NavLink to="/admin/actors" isActive={isActive("/admin/actors")} onClick={onNavigate}>
          Actors
        </NavLink>

        <NavLink
          to="/admin/enrichment/runs"
          isActive={isActive("/admin/enrichment/runs")}
          onClick={onNavigate}
        >
          Enrichment Runs
        </NavLink>

        <NavLink
          to="/admin/enrichment/review"
          isActive={isActive("/admin/enrichment/review")}
          onClick={onNavigate}
        >
          Review Enrichments
        </NavLink>

        <NavLink
          to="/admin/cause-mappings"
          isActive={isActive("/admin/cause-mappings")}
          onClick={onNavigate}
        >
          Cause Mappings
        </NavLink>

        <NavLink
          to="/admin/operations"
          isActive={isActive("/admin/operations")}
          onClick={onNavigate}
        >
          System Ops
        </NavLink>

        <NavLink to="/admin/ab-tests" isActive={isActive("/admin/ab-tests")} onClick={onNavigate}>
          A/B Tests
        </NavLink>

        <NavLink to="/admin/jobs" isActive={isActive("/admin/jobs")} onClick={onNavigate}>
          Jobs & Logs
        </NavLink>
      </div>

      {/* Footer with external links, theme toggle, and logout */}
      <div className="border-t border-admin-border-subtle p-4">
        {/* External tool links */}
        <div className="mb-3 flex items-center justify-center gap-3">
          {import.meta.env.VITE_GOOGLE_ANALYTICS_URL && (
            <a
              href={import.meta.env.VITE_GOOGLE_ANALYTICS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-2 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
              aria-label="Google Analytics (opens in new tab)"
              title="Google Analytics"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22 3.2c0-.66-.54-1.2-1.2-1.2h-3.6C16.54 2 16 2.54 16 3.2v17.6c0 .66.54 1.2 1.2 1.2h3.6c.66 0 1.2-.54 1.2-1.2V3.2zM14 9.2c0-.66-.54-1.2-1.2-1.2H9.2C8.54 8 8 8.54 8 9.2v11.6c0 .66.54 1.2 1.2 1.2h3.6c.66 0 1.2-.54 1.2-1.2V9.2zM6 15.2c0-.66-.54-1.2-1.2-1.2H1.2c-.66 0-1.2.54-1.2 1.2v5.6C0 21.46.54 22 1.2 22h3.6c.66 0 1.2-.54 1.2-1.2v-5.6z" />
              </svg>
            </a>
          )}
          {import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL && (
            <a
              href={import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-2 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
              aria-label="Google Search Console (opens in new tab)"
              title="Google Search Console"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </a>
          )}
          {import.meta.env.VITE_NEW_RELIC_URL && (
            <a
              href={import.meta.env.VITE_NEW_RELIC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-2 text-admin-text-muted transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
              aria-label="New Relic APM (opens in new tab)"
              title="New Relic APM"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="rounded-md px-4 py-2 text-sm font-medium text-admin-text-secondary transition-colors hover:bg-admin-interactive-secondary hover:text-admin-text-primary"
            data-testid="admin-logout-button"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
