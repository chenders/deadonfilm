/**
 * Card displaying a related celebrity with optional link to their actor page.
 */

import { Link } from "react-router-dom"
import type { RelatedCelebrity } from "@/types"

interface RelatedCelebrityCardProps {
  celebrity: RelatedCelebrity
}

export default function RelatedCelebrityCard({ celebrity }: RelatedCelebrityCardProps) {
  const content = (
    <div className="rounded-lg bg-surface-elevated p-3">
      <p className="font-medium text-brown-dark">{celebrity.name}</p>
      <p className="mt-1 text-sm text-text-muted">{celebrity.relationship}</p>
    </div>
  )

  if (celebrity.slug) {
    return (
      <Link
        to={`/actor/${celebrity.slug}`}
        className="block transition-colors hover:bg-cream"
        data-testid="related-celebrity"
      >
        {content}
      </Link>
    )
  }

  return <div data-testid="related-celebrity">{content}</div>
}
