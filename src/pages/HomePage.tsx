import { Helmet } from "react-helmet-async"
import SearchBar from "@/components/search/SearchBar"
import QuickActions from "@/components/search/QuickActions"
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

        <OnThisDay />
      </div>
    </>
  )
}
