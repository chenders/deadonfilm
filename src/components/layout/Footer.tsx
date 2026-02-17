import { Link } from "react-router-dom"

const linkClass = "text-sm text-text-primary transition-colors hover:text-brown-dark"

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-auto border-t border-brown-medium/20 bg-cream/50 py-10 sm:py-12"
    >
      <div className="mx-auto max-w-2xl px-6">
        <nav data-testid="footer-nav" aria-label="Footer">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-12">
            <div>
              <h3 className="mb-3 border-b border-brown-medium/20 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Explore
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/death-watch" className={linkClass}>
                    Death Watch
                  </Link>
                </li>
                <li>
                  <Link to="/deaths/notable" className={linkClass}>
                    Notable Deaths
                  </Link>
                </li>
                <li>
                  <Link to="/causes-of-death" className={linkClass}>
                    Causes of Death
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 border-b border-brown-medium/20 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Statistics
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/deaths/decades" className={linkClass}>
                    Deaths by Decade
                  </Link>
                </li>
                <li>
                  <Link to="/movies/genres" className={linkClass}>
                    Movie Genres
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 border-b border-brown-medium/20 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Information
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/about" className={linkClass}>
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className={linkClass}>
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link to="/methodology" className={linkClass}>
                    Methodology
                  </Link>
                </li>
                <li>
                  <Link to="/data-sources" className={linkClass}>
                    Data Sources
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <div className="mt-8 border-t border-brown-medium/20 pt-6 text-center sm:mt-10 sm:pt-8">
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block opacity-60 transition-opacity hover:opacity-80"
            data-testid="tmdb-logo-link"
          >
            <img
              src="/tmdb-logo.svg"
              alt="TMDB"
              width="92"
              height="12"
              className="h-3 dark:brightness-0 dark:invert"
            />
          </a>
          <p className="mt-2 text-[10px] text-text-muted">
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
