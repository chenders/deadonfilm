import { FilmReelIcon, PersonIcon } from "@/components/icons"

type EmptyStateType = "no-results" | "no-deceased" | "quiet-day"

interface EmptyStateCardProps {
  type: EmptyStateType
  searchQuery?: string
}

const emptyStates: Record<
  EmptyStateType,
  { title: string; subtitle: string; icon: "film" | "person" }
> = {
  "no-results": {
    title: "End of Reel",
    subtitle: "No films match your search",
    icon: "film",
  },
  "no-deceased": {
    title: "All Present & Accounted For",
    subtitle: "No cast members have passed away",
    icon: "person",
  },
  "quiet-day": {
    title: "A Quiet Day",
    subtitle: "No notable deaths recorded for this date",
    icon: "film",
  },
}

export default function EmptyStateCard({ type, searchQuery }: EmptyStateCardProps) {
  const { title, subtitle, icon } = emptyStates[type]
  const IconComponent = icon === "film" ? FilmReelIcon : PersonIcon

  return (
    <div
      data-testid="empty-state-card"
      className="flex flex-col items-center justify-center py-8 text-center"
    >
      <div className="bg-beige border-2 border-brown-medium/20 rounded-lg p-6 max-w-sm">
        {/* Film strip decoration top */}
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-2.5 h-1.5 bg-brown-medium/15 rounded-sm" />
          ))}
        </div>

        <IconComponent size={36} className="text-brown-medium/50 mx-auto mb-3" />

        <h3 className="text-base font-display text-brown-dark mb-1 tracking-wide uppercase">
          {title}
        </h3>
        <p className="text-sm text-text-muted">
          {subtitle}
          {searchQuery && type === "no-results" && (
            <span className="block mt-1 text-brown-medium italic">"{searchQuery}"</span>
          )}
        </p>

        {/* Film strip decoration bottom */}
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-2.5 h-1.5 bg-brown-medium/15 rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  )
}
