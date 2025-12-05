import type { DeceasedActor } from '@/types'
import DeceasedCard from './DeceasedCard'

interface DeceasedListProps {
  actors: DeceasedActor[]
  movieTitle: string
}

export default function DeceasedList({ actors, movieTitle }: DeceasedListProps) {
  if (actors.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted text-lg">No deceased cast members found for {movieTitle}</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-2xl text-brown-dark mb-4">Deceased Cast Members</h2>

      <div className="space-y-3">
        {actors.map((actor) => (
          <DeceasedCard key={actor.id} actor={actor} />
        ))}
      </div>
    </div>
  )
}
