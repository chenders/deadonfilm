export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-auto border-t border-brown-medium/20 bg-cream/50 py-4 dark:border-[#4a3d32] dark:bg-[#1a1612]/50"
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
            <img
              src="/tmdb-logo.svg"
              alt="TMDB"
              width="92"
              height="12"
              className="h-3 dark:invert"
            />
          </a>
          <p className="text-[10px] text-text-muted dark:text-[#9a8b7a]">
            This product uses the{" "}
            <a
              href="https://developer.themoviedb.org/docs/faq#what-are-the-attribution-requirements"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brown-dark dark:hover:text-[#d4c8b5]"
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
