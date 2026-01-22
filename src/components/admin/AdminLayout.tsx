import { ReactNode, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAdminAuth } from "../../hooks/useAdminAuth"
import AdminNav from "./AdminNav"
import LoadingSpinner from "../common/LoadingSpinner"

interface AdminLayoutProps {
  children: ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { isAuthenticated, isLoading } = useAdminAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/admin/login")
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex min-h-screen bg-gray-900">
      <AdminNav />
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
