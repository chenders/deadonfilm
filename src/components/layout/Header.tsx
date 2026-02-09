import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import SkullLogo from "./SkullLogo"
import ThemeToggle from "./ThemeToggle"
import SearchTrigger from "@/components/search/SearchTrigger"
import MobileMenu from "./MobileMenu"

const NAV_LINKS = [
  { to: "/deaths/all", label: "Deaths" },
  { to: "/genres", label: "Genres" },
  { to: "/causes-of-death", label: "Causes" },
]

export default function Header() {
  const location = useLocation()
  const isHomePage = location.pathname === "/"
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      <header data-testid="site-header" className="px-4 pb-1 pt-1 md:py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            data-testid="home-link"
            className="flex items-center gap-2 transition-opacity hover:opacity-80 md:gap-3"
          >
            <SkullLogo data-testid="skull-logo" className="h-auto w-16 md:w-24" />
            <p
              data-testid="site-title"
              className="font-display text-2xl italic text-brown-dark md:text-5xl"
            >
              Dead on Film
            </p>
          </Link>

          {/* Desktop nav links - only on non-home pages */}
          {!isHomePage && (
            <nav
              data-testid="desktop-nav"
              className="hidden items-center gap-1 md:flex"
              aria-label="Main navigation"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    location.pathname === link.to || location.pathname.startsWith(link.to + "/")
                      ? "bg-brown-medium/20 text-brown-dark"
                      : "text-brown-dark/70 hover:bg-brown-medium/10 hover:text-brown-dark"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {!isHomePage && <SearchTrigger />}
            {/* Hamburger button - only on non-home pages, mobile only */}
            {!isHomePage && (
              <button
                data-testid="hamburger-button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 text-brown-dark/70 transition-colors hover:bg-brown-medium/10 hover:text-brown-dark md:hidden"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
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
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {!isHomePage && (
        <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      )}
    </>
  )
}
