import { useState } from "react"
import SeasonSelector from "./SeasonSelector"
import EpisodeList from "./EpisodeList"
import { useSeasonEpisodes } from "@/hooks/useSeasonEpisodes"
import type { SeasonSummary } from "@/types"

interface EpisodeBrowserProps {
  seasons: SeasonSummary[]
  showId: number
  showName: string
  showFirstAirDate: string | null
}

export default function EpisodeBrowser({
  seasons,
  showId,
  showName,
  showFirstAirDate,
}: EpisodeBrowserProps) {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)

  const { data, isLoading } = useSeasonEpisodes(showId, selectedSeason)

  // Find the selected season's info
  const selectedSeasonInfo =
    selectedSeason !== null ? seasons.find((s) => s.seasonNumber === selectedSeason) : null

  if (seasons.length === 0) {
    return null
  }

  return (
    <div data-testid="episode-browser" className="mb-6">
      <SeasonSelector
        seasons={seasons}
        selectedSeason={selectedSeason}
        onSelectSeason={setSelectedSeason}
      />

      {selectedSeason !== null && (
        <EpisodeList
          episodes={data?.episodes ?? []}
          showId={showId}
          showName={showName}
          showFirstAirDate={showFirstAirDate}
          seasonNumber={selectedSeason}
          seasonName={selectedSeasonInfo?.name ?? `Season ${selectedSeason}`}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
