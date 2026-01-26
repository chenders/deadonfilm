import { ReactNode, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"
import { AdminThemeProvider } from "../../contexts/AdminThemeContext"
import { useMobileMenu } from "../../hooks/admin/useMobileMenu"
import AdminNav from "./AdminNav"
import { MobileMenuButton } from "./MobileMenuButton"
import LoadingSpinner from "../common/LoadingSpinner"

interface AdminLayoutProps {
  children: ReactNode
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { isAuthenticated, isLoading } = useAdminAuth()
  const navigate = useNavigate()
  const mobileMenu = useMobileMenu()

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
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:z-auto md:translate-x-0 ${
          mobileMenu.isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AdminNav onNavigate={mobileMenu.close} />
      </aside>

      {/* Main content */}
      <main className="flex-1 pt-14 md:pt-0">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  )
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminThemeProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminThemeProvider>
  )
}
