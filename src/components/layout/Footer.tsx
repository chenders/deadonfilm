import { Link } from "react-router-dom"

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-auto border-t border-brown-medium/20 bg-cream/50 py-4"
    >
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <nav
            data-testid="footer-nav"
            aria-label="Footer"
            className="mb-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1"
          >
            <Link
              to="/about"
              className="text-sm text-text-muted transition-colors hover:text-brown-dark"
            >
              About
            </Link>
            <Link
              to="/faq"
              className="text-sm text-text-muted transition-colors hover:text-brown-dark"
            >
              FAQ
            </Link>
            <Link
              to="/methodology"
              className="text-sm text-text-muted transition-colors hover:text-brown-dark"
            >
              Methodology
            </Link>
            <Link
              to="/data-sources"
              className="text-sm text-text-muted transition-colors hover:text-brown-dark"
            >
              Data Sources
            </Link>
          </nav>
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
              className="h-3 dark:brightness-0 dark:invert"
            />
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
