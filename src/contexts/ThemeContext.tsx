import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const isServer = typeof window === "undefined"

const STORAGE_KEY = "dof-theme"
const COOKIE_NAME = "dof-theme"

function getSystemTheme(): ResolvedTheme {
  if (isServer) return "light"
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

/** Write the theme to a cookie so the server can read it for SSR. */
function setThemeCookie(resolvedTheme: ResolvedTheme) {
  if (isServer) return
  document.cookie = `${COOKIE_NAME}=${resolvedTheme};path=/;max-age=31536000;SameSite=Lax`
}

interface ThemeProviderProps {
  children: ReactNode
  /** Server-side hint from cookie — avoids FOUC when SSR is active */
  serverTheme?: ResolvedTheme
}

export function ThemeProvider({ children, serverTheme }: ThemeProviderProps) {
  // Two-phase init: default to server hint (or "system"), then read localStorage in effect
  const [theme, setThemeState] = useState<Theme>(() => {
    if (isServer)
      return serverTheme === "dark" ? "dark" : serverTheme === "light" ? "light" : "system"
    return getStoredTheme()
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (isServer) return serverTheme ?? "light"
    const stored = getStoredTheme()
    if (stored === "dark" || stored === "light") return stored
    return getSystemTheme()
  })

  // On mount, sync from localStorage (handles SSR → client hydration)
  useEffect(() => {
    const stored = getStoredTheme()
    setThemeState(stored)
    const resolved = stored === "dark" || stored === "light" ? stored : getSystemTheme()
    setResolvedTheme(resolved)
    setThemeCookie(resolved)
  }, [])

  // Apply/remove .dark class on <html>
  useEffect(() => {
    const root = document.documentElement
    if (resolvedTheme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [resolvedTheme])

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? "dark" : "light"
      setResolvedTheme(newResolved)
      setThemeCookie(newResolved)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    if (!isServer) {
      localStorage.setItem(STORAGE_KEY, newTheme)
    }

    const newResolved = newTheme === "system" ? getSystemTheme() : newTheme
    setResolvedTheme(newResolved)
    setThemeCookie(newResolved)
  }, [])

  const toggleTheme = useCallback(() => {
    const newTheme: ResolvedTheme = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}
