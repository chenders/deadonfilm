import { Link } from "react-router-dom"
import SkullLogo from "./SkullLogo"

export default function Header() {
  return (
    <header className="py-6 px-4">
      <Link to="/" className="flex flex-col items-center gap-2 hover:opacity-80 transition-opacity">
        <SkullLogo className="w-32 h-auto" />
        <h1 className="font-display text-4xl md:text-5xl text-brown-dark italic">Dead on Film</h1>
      </Link>
    </header>
  )
}
