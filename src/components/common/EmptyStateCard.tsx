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
      <div className="max-w-sm rounded-lg border-2 border-brown-medium/20 bg-beige p-6">
        {/* Film strip decoration top */}
        <div className="mb-4 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-1.5 w-2.5 rounded-sm bg-brown-medium/15" />
          ))}
        </div>

        <IconComponent size={36} className="mx-auto mb-3 text-brown-medium/50" />

        <h3 className="mb-1 font-display text-base uppercase tracking-wide text-brown-dark">
          {title}
        </h3>
        <p className="text-sm text-text-muted">
          {subtitle}
          {searchQuery && type === "no-results" && (
            <span className="mt-1 block italic text-brown-medium">"{searchQuery}"</span>
          )}
        </p>

        {/* Film strip decoration bottom */}
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-1.5 w-2.5 rounded-sm bg-brown-medium/15" />
          ))}
        </div>
      </div>
    </div>
  )
}
