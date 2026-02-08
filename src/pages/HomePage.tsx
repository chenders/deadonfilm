import { Helmet } from "react-helmet-async"
import SearchBar from "@/components/search/SearchBar"
import QuickActions from "@/components/search/QuickActions"
import SiteStats from "@/components/home/SiteStats"
import RecentDeaths from "@/components/home/RecentDeaths"
import JsonLd from "@/components/seo/JsonLd"
import { buildWebsiteSchema } from "@/utils/schema"

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Dead on Film - Movie & TV Show Cast Mortality Database</title>
        <meta
          name="description"
          content="Look up any movie or TV show and see which actors have passed away. Discover mortality statistics, death dates, and causes of death for films and TV shows."
        />
        <meta
          property="og:title"
          content="Dead on Film - Movie & TV Show Cast Mortality Database"
        />
        <meta
          property="og:description"
          content="Look up any movie or TV show and see which actors have passed away. Discover mortality statistics and causes of death."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://deadonfilm.com" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta
          name="twitter:title"
          content="Dead on Film - Movie & TV Show Cast Mortality Database"
        />
        <meta
          name="twitter:description"
          content="Look up any movie or TV show and see which actors have passed away. Discover mortality statistics and causes of death."
        />
        <link rel="canonical" href="https://deadonfilm.com" />
      </Helmet>

      <JsonLd data={buildWebsiteSchema()} />

      <div data-testid="home-page" className="mx-auto max-w-2xl text-center">
        <p data-testid="home-tagline" className="mb-6 text-lg text-text-muted">
          Search for a movie, TV show, or person to see who has passed away
        </p>

        <SearchBar />
        <QuickActions />

        <RecentDeaths />
        <SiteStats />
      </div>
    </>
  )
}
