import { Link, useLocation } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"

export default function AdminNav() {
  const location = useLocation()
  const { logout } = useAdminAuth()

  const isActive = (path: string) => {
    return location.pathname === path
  }

  const handleLogout = async () => {
    await logout()
  }

  return (
    <nav className="min-h-screen w-64 border-r border-gray-700 bg-gray-800 p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Dead on Film</h1>
        <p className="text-sm text-gray-400">Admin Panel</p>
      </div>

      <div className="space-y-2">
        <Link
          to="/admin/dashboard"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            isActive("/admin/dashboard")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Dashboard
        </Link>

        <Link
          to="/admin/analytics"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/analytics")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Analytics
        </Link>

        <Link
          to="/admin/coverage"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/coverage")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Death Coverage
        </Link>

        <Link
          to="/admin/actors"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/actors")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Actor Management
        </Link>

        <Link
          to="/admin/page-views"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/page-views")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Page Views
        </Link>

        <Link
          to="/admin/enrichment/runs"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/enrichment/runs")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Enrichment Runs
        </Link>

        <Link
          to="/admin/enrichment/review"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/enrichment/review")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Review Enrichments
        </Link>

        <Link
          to="/admin/tools"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/tools")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          External Tools
        </Link>

        {/* Operations Section */}
        <div className="mb-2 mt-6 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Operations
        </div>

        <Link
          to="/admin/actor-diagnostic"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/actor-diagnostic")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Actor Diagnostic
        </Link>

        <Link
          to="/admin/cache"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/cache")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Cache Management
        </Link>

        <Link
          to="/admin/sitemap"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/sitemap")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Sitemap Management
        </Link>

        <Link
          to="/admin/ab-tests"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/ab-tests")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          A/B Tests
        </Link>
      </div>

      <div className="mt-auto pt-8">
        <button
          onClick={handleLogout}
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
          data-testid="admin-logout-button"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
