import type { LivingActor } from '@/types'
import { getProfileUrl } from '@/services/api'

interface LastSurvivorProps {
  actor: LivingActor
  totalLiving: number
}

export default function LastSurvivor({ actor, totalLiving }: LastSurvivorProps) {
  const profileUrl = getProfileUrl(actor.profile_path, 'w185')

  if (totalLiving > 3) {
    // Don't show "last survivor" if there are still several living
    return null
  }

  const title =
    totalLiving === 1 ? 'Last Surviving Cast Member' : `${totalLiving} Surviving Cast Members`

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
      <h3 className="font-display text-lg text-green-800 mb-3">{title}</h3>

      <div className="flex items-center gap-4">
        {profileUrl ? (
          <img src={profileUrl} alt={actor.name} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-2xl">👤</span>
          </div>
        )}

        <div>
          <p className="font-semibold text-green-900">{actor.name}</p>
          <p className="text-sm text-green-700">as {actor.character}</p>
          {actor.age && <p className="text-sm text-green-600">Age: {actor.age}</p>}
        </div>
      </div>
    </div>
  )
}
