import type { DeceasedActor } from "@/types"
import DeceasedCard from "./DeceasedCard"

interface DeceasedListProps {
  actors: DeceasedActor[]
  movieTitle: string
  isPolling?: boolean
}

export default function DeceasedList({ actors, movieTitle, isPolling = false }: DeceasedListProps) {
  if (actors.length === 0) {
    return (
      <div data-testid="no-deceased-message" className="text-center py-8">
        <p className="text-text-muted text-lg">No deceased cast members found for {movieTitle}</p>
      </div>
    )
  }

  return (
    <div data-testid="deceased-list">
      <h2 data-testid="deceased-list-title" className="font-display text-2xl text-brown-dark mb-4">
        Deceased Cast Members
      </h2>

      <div data-testid="deceased-cards" className="space-y-3">
        {actors.map((actor) => (
          <DeceasedCard key={actor.id} actor={actor} isPolling={isPolling} />
        ))}
      </div>
    </div>
  )
}
