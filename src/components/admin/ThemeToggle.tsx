import { useAdminTheme } from "../../contexts/AdminThemeContext"

interface ThemeToggleProps {
  /** Additional CSS classes */
  className?: string
}

/**
 * Theme toggle button for switching between dark and light modes.
 * Displays sun icon in dark mode, moon icon in light mode.
 */
export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useAdminTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`rounded-md p-2 transition-colors hover:bg-admin-interactive-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface-base ${className}`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        // Sun icon - shown in dark mode (click to go light)
        <svg
          className="h-5 w-5 text-admin-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Moon icon - shown in light mode (click to go dark)
        <svg
          className="h-5 w-5 text-admin-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  )
}
