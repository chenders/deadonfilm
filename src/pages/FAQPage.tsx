import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema, buildFAQPageSchema } from "@/utils/schema"

const BASE_URL = "https://deadonfilm.com"

const FAQ_ITEMS = [
  {
    question: "What is Dead on Film?",
    answer:
      "Dead on Film is a movie and TV cast mortality database. You can look up any movie or TV show to see which cast members have passed away, along with their cause of death, age at death, and mortality statistics for the entire cast.",
  },
  {
    question: "Where does the movie and TV data come from?",
    answer:
      "All movie and TV show metadata — including cast lists, release dates, posters, and production details — comes from The Movie Database (TMDB), a community-built database with information on millions of productions.",
  },
  {
    question: "How do you determine if an actor has died?",
    answer:
      "We use a multi-source pipeline to verify death information. The primary source is AI-assisted analysis of reliable references, followed by structured data from Wikidata and Wikipedia. Information is cross-referenced across sources for accuracy.",
  },
  {
    question: "How is 'Years Lost' calculated?",
    answer:
      "Years Lost compares an actor's actual lifespan to their expected lifespan based on U.S. Social Security Administration cohort life expectancy tables. A positive value means the actor died earlier than statistically expected for someone of their birth year and sex.",
  },
  {
    question: "What are Expected Deaths?",
    answer:
      "Expected Deaths is the statistical number of cast members who would be expected to have died by now, based on actuarial life tables. It's calculated by summing each actor's cumulative probability of death from their age at filming to their current age (or age at death).",
  },
  {
    question: "What is the Archived Footage rule?",
    answer:
      "Actors who died more than 3 years before a film's release are excluded from mortality statistics. This filters out cases where archived or previously recorded footage was used, since those actors weren't actively involved in the production.",
  },
  {
    question: "How do you determine cause of death?",
    answer:
      "Cause of death information follows a priority system: (1) AI-assisted analysis of authoritative sources, (2) Wikidata's structured cause-of-death property, and (3) Wikipedia article text as a last resort. Each source is evaluated for confidence level.",
  },
  {
    question: "How often is the data updated?",
    answer:
      "The database is updated regularly. New movies and TV shows are synced from TMDB daily, and death information is continuously enriched through our automated pipeline. Mortality statistics are recalculated whenever cast or death data changes.",
  },
  {
    question: "Is Dead on Film affiliated with TMDB or any movie studio?",
    answer:
      "No. Dead on Film is an independent project. It uses the TMDB API for movie and TV metadata but is not endorsed or certified by TMDB. It has no affiliation with any movie studio, production company, or entertainment industry organization.",
  },
]

export default function FAQPage() {
  return (
    <>
      <Helmet>
        <title>FAQ - Dead on Film</title>
        <meta
          name="description"
          content="Frequently asked questions about Dead on Film. Learn about our data sources, mortality statistics, and how we determine cause of death."
        />
        <meta property="og:title" content="FAQ - Dead on Film" />
        <meta
          property="og:description"
          content="Frequently asked questions about Dead on Film's mortality data and statistics."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${BASE_URL}/faq`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "FAQ", url: `${BASE_URL}/faq` },
        ])}
      />
      <JsonLd data={buildFAQPageSchema(FAQ_ITEMS)} />

      <div data-testid="faq-page" className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Frequently Asked Questions</h1>
          <p className="text-text-muted">Common questions about Dead on Film and how it works</p>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <div key={index} className="rounded-lg bg-beige p-5">
              <h2 className="mb-2 font-display text-lg text-brown-dark">{item.question}</h2>
              <p className="leading-relaxed text-text-muted">{item.answer}</p>
            </div>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl text-brown-dark">Learn More</h2>
          <ul className="space-y-2">
            <li>
              <Link to="/about" className="text-accent underline hover:text-brown-dark">
                About Dead on Film
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
    </>
  )
}
