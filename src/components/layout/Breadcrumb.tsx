import { Link } from "react-router-dom"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length <= 1) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumb">
      <ol className="flex flex-wrap items-center text-sm text-text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <li key={item.label} className="flex items-center">
              {index > 0 && (
                <span className="mx-1 select-none text-text-muted" aria-hidden="true">
                  /
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="text-brown-medium transition-colors hover:text-brown-dark hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium text-brown-dark" aria-current="page">
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
