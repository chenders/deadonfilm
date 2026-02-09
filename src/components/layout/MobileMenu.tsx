import { useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

const NAV_GROUPS = [
  {
    label: "Explore",
    links: [
      { to: "/deaths/all", label: "Deaths" },
      { to: "/genres", label: "Genres" },
      { to: "/causes-of-death", label: "Causes of Death" },
    ],
  },
  {
    label: "Discover",
    links: [
      { to: "/death-watch", label: "Death Watch" },
      { to: "/forever-young", label: "Forever Young" },
      { to: "/deaths/notable", label: "Notable Deaths" },
      { to: "/deaths/decades", label: "Deaths by Decade" },
    ],
  },
  {
    label: "More",
    links: [{ to: "/about", label: "About" }],
  },
]

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const location = useLocation()

  // Close menu on route change
  const prevPathname = useRef(location.pathname)
  useEffect(() => {
    if (prevPathname.current !== location.pathname) {
      prevPathname.current = location.pathname
      if (isOpen) onClose()
    }
  }, [location.pathname, isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="mobile-menu-backdrop"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <nav
        data-testid="mobile-menu"
        role="dialog"
        aria-modal={isOpen || undefined}
        aria-hidden={!isOpen || undefined}
        aria-label="Site navigation"
        // @ts-expect-error -- inert is a standard HTML attribute not yet in React 18 nav types
        inert={!isOpen ? "" : undefined}
        className={`fixed right-0 top-0 z-50 h-full w-72 transform bg-brown-dark shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <div className="flex items-center justify-between border-b border-brown-medium/30 px-4 py-3">
          <span className="font-display text-lg text-cream">Menu</span>
          <button
            data-testid="mobile-menu-close"
            onClick={onClose}
            className="rounded-lg p-2 text-cream/80 transition-colors hover:bg-brown-medium/30 hover:text-cream"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <div className="overflow-y-auto px-4 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream/70">
                {group.label}
              </h3>
              <ul className="space-y-1">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      data-testid={`mobile-nav-${link.to.replace(/\//g, "-").slice(1)}`}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        location.pathname === link.to
                          ? "bg-brown-medium/40 text-cream"
                          : "text-cream/80 hover:bg-brown-medium/20 hover:text-cream"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  )
}
