import { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { useAdminAuth } from "@/hooks/useAdminAuth"

interface AdminModeContextValue {
  adminModeEnabled: boolean
  toggleAdminMode: () => void
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null)

const STORAGE_KEY = "dof-admin-mode"

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAdminAuth()
  const [stored, setStored] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })

  const toggleAdminMode = useCallback(() => {
    setStored((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // localStorage may be unavailable
      }
      return next
    })
  }, [])

  const adminModeEnabled = isAuthenticated && stored

  return (
    <AdminModeContext.Provider value={{ adminModeEnabled, toggleAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  )
}

export function useAdminMode(): AdminModeContextValue {
  const context = useContext(AdminModeContext)
  if (!context) {
    throw new Error("useAdminMode must be used within AdminModeProvider")
  }
  return context
}

const NOOP = () => {}

/**
 * Non-throwing variant that returns disabled admin mode when used
 * outside AdminModeProvider. Useful for components embedded in pages
 * that may not be wrapped by the provider.
 */
export function useOptionalAdminMode(): AdminModeContextValue {
  const context = useContext(AdminModeContext)
  if (!context) {
    return { adminModeEnabled: false, toggleAdminMode: NOOP }
  }
  return context
}
