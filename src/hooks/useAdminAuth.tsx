import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const checkAuth = async () => {
    try {
      const response = await fetch("/admin/api/auth/status", {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setIsAuthenticated(data.authenticated)
      } else {
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error("Auth check failed:", error)
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/admin/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        setIsAuthenticated(true)
        return { success: true }
      } else {
        const data = await response.json()
        return {
          success: false,
          error: data.error?.message || "Login failed",
        }
      }
    } catch (error) {
      console.error("Login error:", error)
      return {
        success: false,
        error: "Network error. Please try again.",
      }
    }
  }

  const logout = async () => {
    try {
      await fetch("/admin/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      setIsAuthenticated(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, checkAuth }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider")
  }
  return context
}

/**
 * Non-throwing variant that returns { isAuthenticated: false } when used
 * outside AdminAuthProvider. Useful for components embedded in pages that
 * may or may not be wrapped by the auth provider.
 */
export function useOptionalAdminAuth(): Pick<AdminAuthContextType, "isAuthenticated"> {
  const context = useContext(AdminAuthContext)
  if (context === undefined) {
    return { isAuthenticated: false }
  }
  return context
}
