import type { DeceasedActor } from "@/types"
import DeceasedCard from "./DeceasedCard"
import EmptyStateCard from "@/components/common/EmptyStateCard"

interface DeceasedListProps {
  actors: DeceasedActor[]
  isPolling?: boolean
}

export default function DeceasedList({ actors, isPolling = false }: DeceasedListProps) {
  if (actors.length === 0) {
    return (
      <div data-testid="no-deceased-message">
        <EmptyStateCard type="no-deceased" />
      </div>
    )
  }

  return (
    <div data-testid="deceased-list">
      <h2 data-testid="deceased-list-title" className="mb-4 font-display text-2xl text-foreground">
        Deceased Cast Members
      </h2>

      <div data-testid="deceased-cards" className="space-y-3">
        {actors.map((actor, index) => (
          <div
            key={actor.id}
            className="animate-fade-slide-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <DeceasedCard actor={actor} isPolling={isPolling} />
          </div>
        ))}
      </div>
    </div>
  )
}
