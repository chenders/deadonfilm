import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema } from "@/utils/schema"

const BASE_URL = "https://deadonfilm.com"

export default function DataSourcesPage() {
  return (
    <>
      <Helmet>
        <title>Data Sources - Dead on Film</title>
        <meta
          name="description"
          content="Learn where Dead on Film gets its data, including TMDB for movie metadata, AI-assisted death verification, Wikidata, Wikipedia, and SSA actuarial tables."
        />
        <meta property="og:title" content="Data Sources - Dead on Film" />
        <meta
          property="og:description"
          content="Where Dead on Film gets its movie, death, and mortality data."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${BASE_URL}/data-sources`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "Data Sources", url: `${BASE_URL}/data-sources` },
        ])}
      />

      <div data-testid="data-sources-page" className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Data Sources</h1>
          <p className="text-text-primary">Where our data comes from and how we keep it accurate</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">The Movie Database (TMDB)</h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                All movie and TV show metadata comes from{" "}
                <a
                  href="https://www.themoviedb.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:text-brown-dark"
                >
                  The Movie Database (TMDB)
                </a>
                , a community-built database with information on millions of productions. TMDB
                provides:
              </p>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed">
                <li>Movie and TV show titles, release dates, and posters</li>
                <li>Full cast lists with character names and billing order</li>
                <li>Actor profiles including birth dates, biographies, and photos</li>
                <li>Basic death dates for some actors (supplemented by our pipeline)</li>
              </ul>
              <p className="leading-relaxed">
                TMDB data is synced daily to capture new releases, cast updates, and corrections.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">
              Research Engine (Debriefer)
            </h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                Both death and biography enrichment are powered by{" "}
                <a
                  href="https://github.com/chenders/debriefer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:text-brown-dark"
                >
                  Debriefer
                </a>
                , an open-source multi-source research orchestration engine. For each actor,
                Debriefer queries 60+ data sources across 8 sequential phases, accumulating evidence
                from structured databases, news archives, books, and web sources. All findings are
                scored by source reliability (based on{" "}
                <a
                  href="https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:text-brown-dark"
                >
                  Wikipedia&apos;s Reliable Sources list
                </a>
                ) and content confidence, then synthesized by Claude into structured narratives.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Death Information</h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                Death information &mdash; including date, cause, manner, and circumstances &mdash;
                is gathered through the Debriefer pipeline. Sources are queried in 8 phases, with
                early stopping once sufficient high-quality evidence is collected:
              </p>
              <div className="space-y-4">
                <div className="rounded-lg bg-beige p-4">
                  <h3 className="mb-1 font-semibold text-brown-dark">Phase 1: Structured Data</h3>
                  <p className="text-sm leading-relaxed">
                    Wikidata (SPARQL queries for cause, manner, and place of death) and Wikipedia
                    (parsed article sections) provide the foundation. These free, high-reliability
                    sources are always queried first.
                  </p>
                </div>
                <div className="rounded-lg bg-beige p-4">
                  <h3 className="mb-1 font-semibold text-brown-dark">
                    Phases 2&ndash;4: Web Search, News &amp; Obituaries
                  </h3>
                  <p className="text-sm leading-relaxed">
                    Web search engines (Google, Bing, DuckDuckGo, Brave) find relevant pages, which
                    are then followed and extracted using Mozilla Readability. Major news outlets
                    (AP, Reuters, NYT, BBC, Guardian, and 15+ others) and entertainment trade press
                    (Variety, Deadline, THR) are queried directly. Obituary sites (Legacy.com, Find
                    a Grave) provide additional coverage.
                  </p>
                </div>
                <div className="rounded-lg bg-beige p-4">
                  <h3 className="mb-1 font-semibold text-brown-dark">
                    Phases 5&ndash;7: Books, Archives &amp; Genealogy
                  </h3>
                  <p className="text-sm leading-relaxed">
                    Google Books, Open Library, and Internet Archive provide book-based evidence.
                    Historical newspaper archives (Chronicling America, Trove, Europeana) cover
                    deaths predating the internet. FamilySearch offers genealogical records.
                  </p>
                </div>
                <div className="rounded-lg bg-beige p-4">
                  <h3 className="mb-1 font-semibold text-brown-dark">Synthesis</h3>
                  <p className="text-sm leading-relaxed">
                    All accumulated findings are sent to Claude, which synthesizes them into a
                    structured record: cause of death, manner, circumstances narrative, location,
                    notable factors, and source attributions. Each field is tracked back to its
                    originating source.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Biography Information</h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                Actor biographies focus on personal life rather than career achievements. The same
                Debriefer pipeline queries 37 sources across structured data, reference sites,
                books, web search, news, and historical archives. Claude synthesizes the results
                into a narrative covering childhood, family, education, and personal struggles
                &mdash; with career mentioned only in passing, like describing anyone&apos;s job.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Actuarial Data</h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                Mortality statistics are calculated using life tables and cohort life expectancy
                data from the{" "}
                <a
                  href="https://www.ssa.gov/oact/STATS/table4c6.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:text-brown-dark"
                >
                  U.S. Social Security Administration
                </a>
                . These tables provide:
              </p>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed">
                <li>Period life tables with death probabilities by age and sex</li>
                <li>
                  Cohort life expectancy that accounts for historical improvements in mortality
                  rates
                </li>
              </ul>
              <p className="leading-relaxed">
                This data forms the basis for our Expected Deaths and Years Lost calculations. See
                our{" "}
                <Link to="/methodology" className="text-accent underline hover:text-brown-dark">
                  Methodology
                </Link>{" "}
                page for details on how these statistics are computed.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Data Freshness</h2>
            <div className="space-y-3 text-text-primary">
              <p className="leading-relaxed">
                Our data pipeline runs on multiple schedules to keep information current:
              </p>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed">
                <li>
                  <strong>Movie &amp; TV metadata:</strong> Synced daily from TMDB
                </li>
                <li>
                  <strong>Death information:</strong> Continuously enriched through our automated
                  pipeline, prioritizing popular actors and recently deceased individuals
                </li>
                <li>
                  <strong>Mortality statistics:</strong> Recalculated whenever underlying cast or
                  death data changes
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Learn More</h2>
            <ul className="space-y-2">
              <li>
                <Link to="/about" className="text-accent underline hover:text-brown-dark">
                  About Dead on Film
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-accent underline hover:text-brown-dark">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <Link to="/methodology" className="text-accent underline hover:text-brown-dark">
                  Methodology
                </Link>{" "}
                &mdash; how we calculate mortality statistics
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
