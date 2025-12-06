export default function Footer() {
  return (
    <footer className="py-6 px-4 text-center text-text-muted text-sm">
      <p>
        Data provided by{" "}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brown-dark"
        >
          The Movie Database (TMDB)
        </a>{" "}
        and{" "}
        <a
          href="https://www.wikidata.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brown-dark"
        >
          Wikidata
        </a>
      </p>
      <p className="mt-2">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  )
}
