import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema } from "@/utils/schema"

const BASE_URL = "https://deadonfilm.com"

export default function MethodologyPage() {
  return (
    <>
      <Helmet>
        <title>Methodology - Dead on Film</title>
        <meta
          name="description"
          content="How Dead on Film calculates mortality statistics and years lost using actuarial life tables from the U.S. Social Security Administration."
        />
        <meta property="og:title" content="Methodology - Dead on Film" />
        <meta
          property="og:description"
          content="How we calculate mortality statistics using actuarial life tables."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${BASE_URL}/methodology`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "Methodology", url: `${BASE_URL}/methodology` },
        ])}
      />

      <div data-testid="methodology-page" className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Methodology</h1>
          <p className="text-text-muted">
            How we calculate mortality statistics for movies and TV shows
          </p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Overview</h2>
            <p className="leading-relaxed text-text-muted">
              Dead on Film compares the actual number of cast deaths to the statistically expected
              number based on actuarial data. This allows us to identify productions where an
              unusually high (or low) number of cast members have passed away, and to quantify how
              much life individual actors may have gained or lost relative to expectations.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">
              Data Foundation: Actuarial Life Tables
            </h2>
            <p className="leading-relaxed text-text-muted">
              Our mortality calculations are built on period life tables published by the U.S.
              Social Security Administration (SSA). These tables provide the probability of death at
              each age for a given year, broken down by sex. We use cohort life expectancy data that
              accounts for historical improvements in mortality rates over time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Expected Deaths</h2>
            <div className="space-y-3 text-text-muted">
              <p className="leading-relaxed">
                For each actor in a cast, we calculate the cumulative probability that they would
                have died between their age at the time of filming and their current age (or age at
                death). The Expected Deaths for a production is the sum of these probabilities
                across all cast members.
              </p>
              <div className="rounded-lg bg-beige p-4 font-mono text-sm">
                Expected Deaths = &Sigma; P(death from filming age to current age) for each actor
              </div>
              <p className="leading-relaxed">
                For example, if an actor was 50 when a film was released and is now 80, we sum the
                yearly probability of death for each year from age 50 to 80, accounting for the
                improving mortality rates of their birth cohort.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Years Lost</h2>
            <div className="space-y-3 text-text-muted">
              <p className="leading-relaxed">
                For deceased actors, Years Lost compares their actual lifespan to their expected
                lifespan:
              </p>
              <div className="rounded-lg bg-beige p-4 font-mono text-sm">
                Years Lost = Expected Lifespan &minus; Actual Lifespan
              </div>
              <p className="leading-relaxed">
                The expected lifespan is derived from SSA cohort life expectancy tables, which
                account for the actor&apos;s birth year and sex. A positive value means the actor
                died younger than statistically expected.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Archived Footage Rule</h2>
            <p className="leading-relaxed text-text-muted">
              Actors who died more than 3 years before a film&apos;s release date are excluded from
              that production&apos;s mortality statistics. This filters out cases where archived or
              previously recorded footage was used in a production, ensuring that mortality stats
              reflect actors who were actively involved around the time of production.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Obscure Content Filtering</h2>
            <div className="space-y-3 text-text-muted">
              <p className="leading-relaxed">
                To maintain data quality, we filter out obscure content that may have incomplete or
                unreliable cast information. A movie is considered obscure if any of the following
                apply:
              </p>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed">
                <li>It has no poster image</li>
                <li>
                  It is an English-language film with TMDB popularity below 5 and fewer than 5 cast
                  members
                </li>
                <li>It is a non-English film with TMDB popularity below 20</li>
              </ul>
              <p className="leading-relaxed">
                Actors are considered non-obscure if they appeared in content with popularity of 20
                or higher, have 3 or more English-language works with popularity of 5 or higher, or
                have appeared in 10 or more movies or 50 or more TV episodes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Limitations</h2>
            <div className="space-y-3 text-text-muted">
              <p className="leading-relaxed">Our methodology has several known limitations:</p>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed">
                <li>
                  Actuarial tables are based on U.S. population averages and may not perfectly
                  reflect the mortality patterns of actors, who may have different socioeconomic
                  factors.
                </li>
                <li>
                  Death information for less well-known actors may be incomplete, potentially
                  understating actual deaths for older productions.
                </li>
                <li>
                  Cause of death is not always publicly available or accurately reported, especially
                  for deaths that occurred decades ago.
                </li>
                <li>
                  Cast lists from TMDB may not include every person who appeared in a production,
                  particularly for uncredited roles.
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
                <Link to="/data-sources" className="text-accent underline hover:text-brown-dark">
                  Data Sources
                </Link>{" "}
                &mdash; where our data comes from
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
