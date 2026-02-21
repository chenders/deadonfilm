import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

interface AdminThemeContextValue {
  /** User's theme preference: "dark", "light", or "system" */
  theme: Theme
  /** Actual theme being applied after resolving "system" preference */
  resolvedTheme: ResolvedTheme
  /** Set theme preference */
  setTheme: (theme: Theme) => void
  /** Toggle between dark and light (sets explicit preference, not system) */
  toggleTheme: () => void
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null)

const isServer = typeof window === "undefined"

const STORAGE_KEY = "admin-theme"

function getSystemTheme(): ResolvedTheme {
  if (isServer) return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getStoredTheme(): Theme {
  if (isServer) return "system"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored
  }
  return "system"
}

interface AdminThemeProviderProps {
  children: ReactNode
  /** Default theme if no preference stored. Defaults to "dark" */
  defaultTheme?: Theme
}

export function AdminThemeProvider({ children, defaultTheme = "dark" }: AdminThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (isServer) return defaultTheme
    const stored = getStoredTheme()
    return stored === "system" ? defaultTheme : stored
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (isServer) return defaultTheme === "dark" || defaultTheme === "light" ? defaultTheme : "dark"
    const stored = getStoredTheme()
    if (stored === "dark" || stored === "light") return stored
    if (defaultTheme === "dark" || defaultTheme === "light") return defaultTheme
    return getSystemTheme()
  })

  // On mount, sync from localStorage (handles SSR → client hydration)
  useEffect(() => {
    const stored = getStoredTheme()
    setThemeState(stored === "system" ? defaultTheme : stored)
    if (stored === "dark" || stored === "light") {
      setResolvedTheme(stored)
    } else if (defaultTheme === "dark" || defaultTheme === "light") {
      setResolvedTheme(defaultTheme)
    } else {
      setResolvedTheme(getSystemTheme())
    }
  }, [defaultTheme])

  // Apply theme class and background to document
  useEffect(() => {
    const root = document.documentElement
    if (resolvedTheme === "light") {
      root.classList.add("admin-light")
    } else {
      root.classList.remove("admin-light")
    }

    // Set background on html+body to prevent white bleed-through
    // when content overflows horizontally on mobile.
    // Derive the color from the CSS variable so there's a single source of truth.
    const previousRootBg = root.style.backgroundColor
    const previousBodyBg = document.body.style.backgroundColor
    const bgColor = getComputedStyle(root).getPropertyValue("--admin-surface-base").trim()

    if (bgColor) {
      root.style.backgroundColor = bgColor
      document.body.style.backgroundColor = bgColor
    }

    return () => {
      root.style.backgroundColor = previousRootBg
      document.body.style.backgroundColor = previousBodyBg
    }
  }, [resolvedTheme])

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? "dark" : "light")
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)

    if (newTheme === "system") {
      setResolvedTheme(getSystemTheme())
    } else {
      setResolvedTheme(newTheme)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    // When toggling, set explicit preference (not system)
    const newTheme: ResolvedTheme = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

  return (
    <AdminThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </AdminThemeContext.Provider>
  )
}

export function useAdminTheme(): AdminThemeContextValue {
  const context = useContext(AdminThemeContext)
  if (!context) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider")
  }
  return context
}
