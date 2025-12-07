import { Link } from "react-router-dom"
import SkullLogo from "./SkullLogo"

export default function Header() {
  return (
    <header data-testid="site-header" className="pt-1 pb-1 md:py-6 px-4">
      <Link
        to="/"
        data-testid="home-link"
        className="flex flex-col items-center gap-0 hover:opacity-80 transition-opacity"
      >
        <SkullLogo className="w-14 md:w-32 h-auto" />
        <h1
          data-testid="site-title"
          className="font-display text-xl md:text-5xl text-brown-dark italic"
        >
          Dead on Film
        </h1>
      </Link>
    </header>
  )
}
