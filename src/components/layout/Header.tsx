import { Link, useLocation } from "react-router-dom"
import SkullLogo from "./SkullLogo"
import SearchTrigger from "@/components/search/SearchTrigger"
import ThemeToggle from "./ThemeToggle"

export default function Header() {
  const location = useLocation()
  const isHomePage = location.pathname === "/"

  return (
    <header data-testid="site-header" className="px-4 pb-1 pt-1 md:py-6">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center">
        {/* Left spacer - matches SearchTrigger width to keep logo centered */}
        <div aria-hidden="true" />

        {/* Centered logo and title */}
        <Link
          to="/"
          data-testid="home-link"
          className="flex items-center justify-center gap-2 transition-opacity hover:opacity-80 md:gap-3"
        >
          <SkullLogo data-testid="skull-logo" className="h-auto w-16 md:w-24" />
          <h1
            data-testid="site-title"
            className="font-display text-2xl italic text-foreground dark:text-[#d4c8b5] md:text-5xl"
          >
            Dead on Film
          </h1>
        </Link>

        {/* Right-aligned controls - search hidden on home page which has its own search */}
        <div className="flex items-center justify-end gap-1">
          {!isHomePage && <SearchTrigger />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
