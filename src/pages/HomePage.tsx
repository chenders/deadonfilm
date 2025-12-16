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
        <meta property="og:title" content="Dead on Film - Movie Cast Mortality Database" />
        <meta
          property="og:description"
          content="Look up any movie and see which actors have passed away. Discover mortality statistics and causes of death."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://deadonfilm.com" />
        <link rel="canonical" href="https://deadonfilm.com" />
      </Helmet>

      <div data-testid="home-page" className="mx-auto max-w-2xl text-center">
        <p data-testid="home-tagline" className="mb-6 text-lg text-text-muted">
          Search for a movie to see which cast members have passed away
        </p>

        <SearchBar />
        <QuickActions />

        <RecentDeaths />
        <OnThisDay />
        <SiteStats />
      </div>
    </>
  )
}
