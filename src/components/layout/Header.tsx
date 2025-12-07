import { Link } from "react-router-dom"
import SkullLogo from "./SkullLogo"

export default function Header() {
  return (
    <header data-testid="site-header" className="pt-1 pb-1 md:py-6 px-4">
      <Link
        to="/"
        data-testid="home-link"
        className="flex items-center justify-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
      >
        <SkullLogo data-testid="skull-logo" className="w-16 md:w-24 h-auto" />
        <h1
          data-testid="site-title"
          className="font-display text-2xl md:text-5xl text-brown-dark italic"
        >
          Dead on Film
        </h1>
      </Link>
    </header>
  )
}
