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
          to="/admin/enrichment/runs"
          className={`block rounded-md px-4 py-2 text-sm font-medium ${
            location.pathname.startsWith("/admin/enrichment")
              ? "bg-gray-900 text-white"
              : "text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Enrichment Runs
        </Link>

        {/* Future stages will add more navigation items */}
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
