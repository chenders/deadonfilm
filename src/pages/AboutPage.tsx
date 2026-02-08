import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema } from "@/utils/schema"

const BASE_URL = "https://deadonfilm.com"

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About - Dead on Film</title>
        <meta
          name="description"
          content="Learn about Dead on Film, a movie and TV cast mortality database. Discover which actors from your favorite films and shows have passed away."
        />
        <meta property="og:title" content="About - Dead on Film" />
        <meta
          property="og:description"
          content="Learn about Dead on Film, a movie and TV cast mortality database."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${BASE_URL}/about`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "About", url: `${BASE_URL}/about` },
        ])}
      />

      <div data-testid="about-page" className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">About Dead on Film</h1>
          <p className="text-text-muted">A movie and TV cast mortality database</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">What is Dead on Film?</h2>
            <p className="leading-relaxed text-text-muted">
              Dead on Film lets you look up any movie or TV show and see which cast members have
              passed away. For each production, we show mortality statistics including who has died,
              their cause of death, age at death, and how the cast&apos;s mortality compares to
              actuarial expectations.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Why Does This Exist?</h2>
            <p className="leading-relaxed text-text-muted">
              Have you ever watched a classic film and wondered how many of the actors are still
              alive? Dead on Film was built to answer that question. What started as simple
              curiosity grew into a comprehensive database covering hundreds of thousands of actors
              across movies and television.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">How It Works</h2>
            <div className="space-y-3 text-text-muted">
              <p className="leading-relaxed">
                We combine data from multiple authoritative sources to build a complete picture of
                cast mortality:
              </p>
              <ul className="ml-4 list-disc space-y-2 leading-relaxed">
                <li>
                  <strong>Movie &amp; TV metadata</strong> comes from The Movie Database (TMDB),
                  providing cast lists, release dates, and production details.
                </li>
                <li>
                  <strong>Death information</strong> is gathered through a multi-source pipeline
                  that cross-references AI analysis, Wikidata, and Wikipedia for accuracy.
                </li>
                <li>
                  <strong>Mortality statistics</strong> are calculated using U.S. Social Security
                  Administration actuarial life tables, allowing us to compare actual deaths against
                  statistical expectations.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">
              Our Commitment to Accuracy
            </h2>
            <p className="leading-relaxed text-text-muted">
              We take data accuracy seriously. Death information is cross-referenced across multiple
              sources before being published. Our cause-of-death data uses a priority system that
              favors authoritative sources and flags uncertain information with confidence levels.
              When information is disputed or unverified, we note that clearly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Contact</h2>
            <p className="leading-relaxed text-text-muted">
              Dead on Film is an independent project. If you notice any errors in our data or have
              questions about the site, you can reach us through our{" "}
              <a
                href="https://github.com/chenders/deadonfilm/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline hover:text-brown-dark"
              >
                GitHub issue tracker
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl text-brown-dark">Learn More</h2>
            <ul className="space-y-2">
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
