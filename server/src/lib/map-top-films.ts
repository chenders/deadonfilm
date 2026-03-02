/** Maps DB top_films to API knownFor format */
export function mapTopFilms(
  topFilms: Array<{ title: string; year: number | null }> | null
): Array<{ name: string; year: number | null; type: string }> | null {
  if (!topFilms || topFilms.length === 0) return null
  return topFilms.map((f) => ({ name: f.title, year: f.year, type: "movie" }))
}
