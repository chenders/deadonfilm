import { useState, useCallback, useEffect } from "react"

interface UseMobileMenuReturn {
  /** Whether the mobile menu is currently open */
  isOpen: boolean
  /** Open the mobile menu */
  open: () => void
  /** Close the mobile menu */
  close: () => void
  /** Toggle the mobile menu */
  toggle: () => void
}

/**
 * Hook for managing mobile menu state.
 * Handles body scroll lock and escape key to close.
 */
export function useMobileMenu(): UseMobileMenuReturn {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, close])

  // Close on resize to desktop
  useEffect(() => {
    if (!isOpen) return

    const handleResize = () => {
      // 768px is the md breakpoint in Tailwind
      if (window.innerWidth >= 768) {
        close()
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [isOpen, close])

  return { isOpen, open, close, toggle }
}
