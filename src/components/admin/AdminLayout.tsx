import { ReactNode, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"
import { AdminThemeProvider } from "../../contexts/AdminThemeContext"
import { useMobileMenu } from "../../hooks/admin/useMobileMenu"
import AdminNav from "./AdminNav"
import { MobileMenuButton } from "./MobileMenuButton"
import LoadingSpinner from "../common/LoadingSpinner"

interface AdminLayoutProps {
  children: ReactNode
  fullWidth?: boolean
  /** Start with the sidebar hidden on desktop so content takes full width */
  hideSidebar?: boolean
}

function AdminLayoutContent({ children, fullWidth, hideSidebar }: AdminLayoutProps) {
  const { isAuthenticated, isLoading } = useAdminAuth()
  const navigate = useNavigate()
  const mobileMenu = useMobileMenu()
  const [sidebarVisible, setSidebarVisible] = useState(!hideSidebar)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/admin/login")
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="admin-layout flex min-h-screen items-center justify-center bg-admin-surface-base">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="admin-layout flex min-h-screen bg-admin-surface-base">
      {/* Mobile header - only visible on small screens */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-admin-border bg-admin-surface-elevated px-4 md:hidden">
        <div className="flex items-center gap-3">
          <MobileMenuButton isOpen={mobileMenu.isOpen} onClick={mobileMenu.toggle} />
          <span className="text-lg font-semibold text-admin-text-primary">Admin</span>
        </div>
      </header>

      {/* Overlay when sidebar is shown as overlay on desktop (hideSidebar mode) */}
      {hideSidebar && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 hidden bg-black/20 md:block"
          onClick={() => setSidebarVisible(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu overlay */}
      {mobileMenu.isOpen && (
        <div
          className="admin-mobile-overlay fixed inset-0 z-40 md:hidden"
          onClick={mobileMenu.close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out ${
          hideSidebar
            ? sidebarVisible
              ? "md:translate-x-0"
              : "md:-translate-x-full"
            : "md:relative md:z-auto md:translate-x-0"
        } ${mobileMenu.isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <AdminNav
          onNavigate={() => {
            mobileMenu.close()
            if (hideSidebar) setSidebarVisible(false)
          }}
        />
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-14 md:pt-0">
        <div className={`mx-auto p-4 md:p-8 ${fullWidth ? "max-w-full" : "max-w-7xl"}`}>
          {hideSidebar && !sidebarVisible && (
            <button
              onClick={() => setSidebarVisible(true)}
              className="mb-4 hidden rounded-md border border-admin-border bg-admin-surface-elevated p-2 text-admin-text-muted shadow-sm transition-colors hover:bg-admin-surface-base hover:text-admin-text-primary md:inline-flex"
              aria-label="Show sidebar"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}

export default function AdminLayout({ children, fullWidth, hideSidebar }: AdminLayoutProps) {
  return (
    <AdminThemeProvider>
      <AdminLayoutContent fullWidth={fullWidth} hideSidebar={hideSidebar}>
        {children}
      </AdminLayoutContent>
    </AdminThemeProvider>
  )
}
