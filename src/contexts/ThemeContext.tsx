import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "dof-theme-preference"

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored
  }
  return "system"
}

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => defaultTheme ?? getStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    theme === "system" ? getSystemTheme() : theme
  )

  // Update resolved theme when theme or system preference changes
  useEffect(() => {
    const updateResolvedTheme = () => {
      const newResolved = theme === "system" ? getSystemTheme() : theme
      setResolvedTheme(newResolved)
    }

    updateResolvedTheme()

    // Listen for system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (theme === "system") {
        updateResolvedTheme()
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  // Apply dark class to document root
  useEffect(() => {
    const root = document.documentElement
    if (resolvedTheme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [resolvedTheme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    // Toggle between light and dark (not system)
    const newTheme = resolvedTheme === "light" ? "dark" : "light"
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
