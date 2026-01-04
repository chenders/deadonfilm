export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-auto border-t border-brown-medium/20 bg-cream/50 py-4"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-60 transition-opacity hover:opacity-80"
            data-testid="tmdb-logo-link"
          >
            <img src="/tmdb-logo.svg" alt="TMDB" width="92" height="12" className="h-3" />
          </a>
          <p className="text-[10px] text-text-muted">
            This product uses the{" "}
            <a
              href="https://developer.themoviedb.org/docs/faq#what-are-the-attribution-requirements"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brown-dark"
            >
              TMDB API
            </a>{" "}
            but is not endorsed or certified by TMDB.
          </p>
        </div>
      </div>
    </footer>
  )
}
