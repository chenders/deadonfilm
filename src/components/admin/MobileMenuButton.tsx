interface MobileMenuButtonProps {
  /** Whether the menu is currently open */
  isOpen: boolean
  /** Click handler to toggle menu */
  onClick: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Hamburger/close button for mobile navigation.
 * Displays hamburger icon when closed, X icon when open.
 */
export function MobileMenuButton({ isOpen, onClick, className = "" }: MobileMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md p-2 transition-colors hover:bg-admin-interactive-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-admin-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface-base ${className}`}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      aria-expanded={isOpen}
    >
      {isOpen ? (
        // X (close) icon
        <svg
          className="h-6 w-6 text-admin-text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        // Hamburger icon
        <svg
          className="h-6 w-6 text-admin-text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  )
}
