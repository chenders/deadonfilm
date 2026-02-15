// Types for related content API responses

export interface RelatedActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string | null
  causeOfDeath: string | null
  birthday: string | null
}

export interface RelatedActorsResponse {
  actors: RelatedActor[]
}

export interface RelatedMovie {
  tmdbId: number
  title: string
  releaseDate: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  sharedCastCount: number
}

export interface RelatedMoviesResponse {
  movies: RelatedMovie[]
}

export interface RelatedShow {
  tmdbId: number
  name: string
  firstAirDate: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  sharedCastCount: number
}

export interface RelatedShowsResponse {
  shows: RelatedShow[]
}
