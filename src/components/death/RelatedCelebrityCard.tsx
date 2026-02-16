/**
 * Card displaying a related celebrity with optional link to their actor page.
 */

import { Link } from "react-router-dom"
import type { RelatedCelebrity } from "@/types"

interface RelatedCelebrityCardProps {
  celebrity: RelatedCelebrity
}

export default function RelatedCelebrityCard({ celebrity }: RelatedCelebrityCardProps) {
  const baseClasses = "rounded-lg border border-brown-light/20 bg-surface-elevated p-3"

  if (celebrity.slug) {
    return (
      <Link
        to={`/actor/${celebrity.slug}`}
        className={`block ${baseClasses} transition-colors hover:border-brown-light/40 hover:bg-cream`}
        data-testid="related-celebrity"
      >
        <p className="font-medium text-brown-dark">{celebrity.name}</p>
        <p className="mt-1 text-sm text-text-muted">{celebrity.relationship}</p>
      </Link>
    )
  }

  return (
    <div className={baseClasses} data-testid="related-celebrity">
      <p className="font-medium text-brown-dark">{celebrity.name}</p>
      <p className="mt-1 text-sm text-text-muted">{celebrity.relationship}</p>
    </div>
  )
}
