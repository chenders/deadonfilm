import { Link } from "react-router-dom"
import SkullLogo from "./SkullLogo"

export default function Header() {
  return (
    <header data-testid="site-header" className="px-4 pb-1 pt-1 md:py-6">
      <Link
        to="/"
        data-testid="home-link"
        className="flex flex-col items-center justify-center transition-opacity hover:opacity-80"
      >
        <h1
          data-testid="site-title"
          className="font-display text-2xl italic text-brown-dark md:text-5xl"
        >
          Dead on Film
        </h1>
        <SkullLogo data-testid="skull-logo" className="h-auto w-16 md:w-32" />
      </Link>
    </header>
  )
}
