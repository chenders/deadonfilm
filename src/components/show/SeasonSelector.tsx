import type { SeasonSummary } from "@/types"

interface SeasonSelectorProps {
  seasons: SeasonSummary[]
  selectedSeason: number | null
  onSelectSeason: (seasonNumber: number | null) => void
}

export default function SeasonSelector({
  seasons,
  selectedSeason,
  onSelectSeason,
}: SeasonSelectorProps) {
  if (seasons.length === 0) {
    return null
  }

  const handleSeasonClick = (seasonNumber: number) => {
    // Toggle off if clicking the same season
    if (selectedSeason === seasonNumber) {
      onSelectSeason(null)
    } else {
      onSelectSeason(seasonNumber)
    }
  }

  return (
    <div data-testid="season-selector" className="w-full">
      <h3 className="mb-2 text-center text-sm font-medium text-text-muted">Browse Episodes</h3>
      <div className="flex justify-center">
        <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-brown-medium/30 bg-white">
          {seasons.map((season, index) => {
            const isSelected = selectedSeason === season.seasonNumber
            const isFirst = index === 0
            const isLast = index === seasons.length - 1

            return (
              <button
                key={season.seasonNumber}
                data-testid={`season-btn-${season.seasonNumber}`}
                aria-pressed={isSelected}
                onClick={() => handleSeasonClick(season.seasonNumber)}
                className={`whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  isSelected ? "bg-accent text-white" : "bg-white text-brown-dark hover:bg-beige"
                } ${isFirst ? "rounded-l-lg" : ""} ${isLast ? "rounded-r-lg" : ""}`}
              >
                S{season.seasonNumber}
                <span className="ml-1 text-xs opacity-75">({season.episodeCount})</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
