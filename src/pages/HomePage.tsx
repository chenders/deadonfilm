import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import SearchBar from "@/components/search/SearchBar"
import QuickActions from "@/components/search/QuickActions"
import SiteStats from "@/components/home/SiteStats"
import RecentDeaths from "@/components/home/RecentDeaths"
import OnThisDay from "@/components/home/OnThisDay"

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Dead on Film - Movie Cast Mortality Database</title>
        <meta
          name="description"
          content="Look up any movie and see which actors have passed away. Discover mortality statistics, death dates, and causes of death for your favorite films."
        />
      </Helmet>

      <div data-testid="home-page" className="mx-auto max-w-2xl text-center">
        <p data-testid="home-tagline" className="mb-8 text-lg text-text-muted">
          Search for a movie to see which cast members have passed away
        </p>

        <SearchBar />
        <QuickActions />

        <SiteStats />
        <RecentDeaths />
        <OnThisDay />

        <section data-testid="seo-content" className="mt-12 text-left">
          <h2 className="mb-3 font-display text-xl text-brown-dark">
            Movie Cast Mortality Database
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-text-muted">
            Discover which actors from your favorite films have passed away. Dead on Film calculates
            expected vs actual deaths using actuarial life tables to find the most statistically
            unlikely mortality rates in cinema history. Search any movie to see death dates, causes,
            and how the film compares to statistical expectations.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/cursed-movies"
              className="text-sm font-medium text-brown-dark hover:text-accent"
            >
              Most Cursed Movies
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
