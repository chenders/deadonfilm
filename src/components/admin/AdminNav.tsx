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

        <NavLink to="/admin/coverage" isActive={isActive("/admin/coverage")} onClick={onNavigate}>
          Death Coverage
        </NavLink>

        <NavLink to="/admin/actors" isActive={isActive("/admin/actors")} onClick={onNavigate}>
          Actor Management
        </NavLink>

        <NavLink
          to="/admin/page-views"
          isActive={isActive("/admin/page-views")}
          onClick={onNavigate}
        >
          Page Views
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

        <NavLink to="/admin/tools" isActive={isActive("/admin/tools")} onClick={onNavigate}>
          External Tools
        </NavLink>

        {/* Operations Section */}
        <div className="mb-2 mt-6 px-4 text-xs font-semibold uppercase tracking-wider text-admin-text-muted">
          Operations
        </div>

        <NavLink
          to="/admin/actor-diagnostic"
          isActive={isActive("/admin/actor-diagnostic")}
          onClick={onNavigate}
        >
          Actor Diagnostic
        </NavLink>

        <NavLink to="/admin/cache" isActive={isActive("/admin/cache")} onClick={onNavigate}>
          Cache Management
        </NavLink>

        <NavLink
          to="/admin/data-quality"
          isActive={isActive("/admin/data-quality")}
          onClick={onNavigate}
        >
          Data Quality
        </NavLink>

        <NavLink
          to="/admin/biographies"
          isActive={isActive("/admin/biographies")}
          onClick={onNavigate}
        >
          Biographies
        </NavLink>

        <NavLink
          to="/admin/popularity"
          isActive={isActive("/admin/popularity")}
          onClick={onNavigate}
        >
          Popularity Scores
        </NavLink>

        <NavLink to="/admin/sync" isActive={isActive("/admin/sync")} onClick={onNavigate}>
          TMDB Sync
        </NavLink>

        <NavLink to="/admin/sitemap" isActive={isActive("/admin/sitemap")} onClick={onNavigate}>
          Sitemap Management
        </NavLink>

        <NavLink to="/admin/ab-tests" isActive={isActive("/admin/ab-tests")} onClick={onNavigate}>
          A/B Tests
        </NavLink>

        <NavLink to="/admin/jobs" isActive={isActive("/admin/jobs")} onClick={onNavigate}>
          Background Jobs
        </NavLink>

        <NavLink to="/admin/logs" isActive={isActive("/admin/logs")} onClick={onNavigate}>
          Error Logs
        </NavLink>
      </div>

      {/* Footer with theme toggle and logout */}
      <div className="border-t border-admin-border-subtle p-4">
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
