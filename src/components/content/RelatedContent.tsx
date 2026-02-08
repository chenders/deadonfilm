import { Link } from "react-router-dom"
import { FilmReelIcon } from "@/components/icons"

interface RelatedItem {
  href: string
  title: string
  subtitle?: string
  imageUrl: string | null
}

interface RelatedContentProps {
  title: string
  items: RelatedItem[]
  icon?: React.ReactNode
  placeholderIcon?: React.ReactNode
}

export default function RelatedContent({
  title,
  items,
  icon,
  placeholderIcon,
}: RelatedContentProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <section data-testid="related-content">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-brown-dark">
        {icon}
        {title}
      </h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="group flex gap-2 rounded-lg bg-surface-elevated p-2 transition-colors hover:bg-cream"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                width={48}
                height={72}
                loading="lazy"
                className="h-[72px] w-[48px] flex-shrink-0 rounded object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-[72px] w-[48px] flex-shrink-0 items-center justify-center rounded bg-brown-medium/20">
                {placeholderIcon ?? <FilmReelIcon size={20} className="text-text-muted" />}
              </div>
            )}

            <div className="min-w-0 py-1">
              <h3
                className="truncate text-sm font-medium text-brown-dark group-hover:text-brown-dark/80"
                title={item.title}
              >
                {item.title}
              </h3>
              {item.subtitle && <p className="truncate text-xs text-text-muted">{item.subtitle}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
