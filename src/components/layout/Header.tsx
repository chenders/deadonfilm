import { Link } from "react-router-dom"
import SkullLogo from "./SkullLogo"
import SearchTrigger from "@/components/search/SearchTrigger"

export default function Header() {
  return (
    <header data-testid="site-header" className="px-4 pb-1 pt-1 md:py-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          to="/"
          data-testid="home-link"
          className="flex items-center gap-2 transition-opacity hover:opacity-80 md:gap-3"
        >
          <SkullLogo data-testid="skull-logo" className="h-auto w-16 md:w-24" />
          <h1
            data-testid="site-title"
            className="font-display text-2xl italic text-brown-dark md:text-5xl"
          >
            Dead on Film
          </h1>
        </Link>
        <SearchTrigger />
      </div>
    </header>
  )
}
