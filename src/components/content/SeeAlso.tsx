import { Link } from "react-router-dom"

interface SeeAlsoLink {
  href: string
  label: string
}

interface SeeAlsoProps {
  links: SeeAlsoLink[]
}

export default function SeeAlso({ links }: SeeAlsoProps) {
  if (links.length === 0) {
    return null
  }

  return (
    <nav
      data-testid="see-also"
      className="rounded-lg bg-surface-elevated p-3"
      aria-label="See also"
    >
      <span className="mr-2 text-sm font-medium text-brown-dark">See also:</span>
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && (
            <span className="mx-1 text-sm text-text-muted" aria-hidden="true">
              &middot;
            </span>
          )}
          <Link
            to={link.href}
            className="text-sm text-brown-medium transition-colors hover:text-brown-dark hover:underline"
          >
            {link.label}
          </Link>
        </span>
      ))}
    </nav>
  )
}
