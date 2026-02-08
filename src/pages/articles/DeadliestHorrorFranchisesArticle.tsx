import { Link } from "react-router-dom"

export default function DeadliestHorrorFranchisesArticle() {
  return (
    <>
      <section>
        <h2 className="mb-3 font-display text-xl text-brown-dark">Measuring Mortality in Horror</h2>
        <p className="leading-relaxed text-text-muted">
          Horror movies are defined by on-screen death, but what about the real mortality of their
          casts? Using actuarial life tables from the U.S. Social Security Administration, we can
          calculate the expected number of deaths for any cast based on their ages at the time of
          filming and compare that to the actual number who have passed away. The difference tells
          us whether a franchise&apos;s cast has experienced unusually high or low mortality.
        </p>
        <p className="mt-3 leading-relaxed text-text-muted">
          For more on how we calculate these statistics, see our{" "}
          <Link to="/methodology" className="text-accent underline hover:text-brown-dark">
            methodology page
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-brown-dark">Franchise Mortality Rates</h2>
        <p className="mb-4 leading-relaxed text-text-muted">
          The table below compares cast mortality across several long-running horror franchises. We
          count unique cast members across all entries in each series and track how many have died
          versus how many deaths we&apos;d statistically expect.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-medium/20 text-left">
                <th className="py-2 pr-4 font-medium text-brown-dark">Franchise</th>
                <th className="py-2 pr-4 text-right font-medium text-brown-dark">Films</th>
                <th className="py-2 pr-4 text-right font-medium text-brown-dark">Cast</th>
                <th className="py-2 pr-4 text-right font-medium text-brown-dark">Deceased</th>
                <th className="py-2 pr-4 text-right font-medium text-brown-dark">Mortality %</th>
                <th className="py-2 text-right font-medium text-brown-dark">Expected Deaths</th>
              </tr>
            </thead>
            <tbody className="text-text-muted">
              <tr className="border-b border-brown-medium/10">
                <td className="py-2 pr-4">A Nightmare on Elm Street</td>
                <td className="py-2 pr-4 text-right">9</td>
                <td className="py-2 pr-4 text-right">187</td>
                <td className="py-2 pr-4 text-right">28</td>
                <td className="py-2 pr-4 text-right">15.0%</td>
                <td className="py-2 text-right">22.4</td>
              </tr>
              <tr className="border-b border-brown-medium/10">
                <td className="py-2 pr-4">Friday the 13th</td>
                <td className="py-2 pr-4 text-right">12</td>
                <td className="py-2 pr-4 text-right">243</td>
                <td className="py-2 pr-4 text-right">31</td>
                <td className="py-2 pr-4 text-right">12.8%</td>
                <td className="py-2 text-right">27.1</td>
              </tr>
              <tr className="border-b border-brown-medium/10">
                <td className="py-2 pr-4">Halloween</td>
                <td className="py-2 pr-4 text-right">13</td>
                <td className="py-2 pr-4 text-right">312</td>
                <td className="py-2 pr-4 text-right">38</td>
                <td className="py-2 pr-4 text-right">12.2%</td>
                <td className="py-2 text-right">35.6</td>
              </tr>
              <tr className="border-b border-brown-medium/10">
                <td className="py-2 pr-4">Saw</td>
                <td className="py-2 pr-4 text-right">10</td>
                <td className="py-2 pr-4 text-right">198</td>
                <td className="py-2 pr-4 text-right">8</td>
                <td className="py-2 pr-4 text-right">4.0%</td>
                <td className="py-2 text-right">6.2</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">The Texas Chain Saw Massacre</td>
                <td className="py-2 pr-4 text-right">9</td>
                <td className="py-2 pr-4 text-right">156</td>
                <td className="py-2 pr-4 text-right">24</td>
                <td className="py-2 pr-4 text-right">15.4%</td>
                <td className="py-2 text-right">18.9</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs italic text-text-muted">
          Note: These are placeholder figures for demonstration purposes. Actual statistics are
          computed from our database and may differ.
        </p>
      </section>

      <section>
        <div className="rounded-lg border border-brown-medium/20 bg-brown-medium/5 p-5">
          <p className="text-center text-lg font-medium text-brown-dark">
            Across these five franchises, an estimated 129 cast members have died out of a combined
            1,096 unique actors &mdash; a raw mortality rate of approximately 11.8%.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-brown-dark">
          Why Some Franchises Have Higher Mortality
        </h2>
        <p className="leading-relaxed text-text-muted">
          The biggest factor in cast mortality isn&apos;t anything supernatural &mdash; it&apos;s
          time. Franchises that started in the 1970s and 1980s naturally have older casts who have
          had more time to reach the end of their natural lifespans. The original{" "}
          <em>Texas Chain Saw Massacre</em> (1974) and <em>Halloween</em> (1978) began nearly fifty
          years ago, so their casts skew older today than those of the <em>Saw</em> series, which
          started in 2004.
        </p>
        <p className="mt-3 leading-relaxed text-text-muted">
          Expected death calculations account for this by using age-adjusted actuarial
          probabilities. When actual deaths exceed expected deaths, the difference suggests factors
          beyond normal aging &mdash; though in most cases, the numbers fall within expected
          statistical variation.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-brown-dark">Explore More Mortality Data</h2>
        <ul className="ml-4 list-disc space-y-2 leading-relaxed text-text-muted">
          <li>
            Browse{" "}
            <Link to="/movies/genres" className="text-accent underline hover:text-brown-dark">
              movies by genre
            </Link>{" "}
            to compare mortality across different genres
          </li>
          <li>
            See{" "}
            <Link to="/causes-of-death" className="text-accent underline hover:text-brown-dark">
              causes of death
            </Link>{" "}
            broken down by category
          </li>
          <li>
            View{" "}
            <Link to="/deaths/decades" className="text-accent underline hover:text-brown-dark">
              deaths by decade
            </Link>{" "}
            to see historical trends
          </li>
          <li>
            Check the{" "}
            <Link to="/death-watch" className="text-accent underline hover:text-brown-dark">
              Death Watch
            </Link>{" "}
            for actors most likely to pass away next based on actuarial data
          </li>
        </ul>
      </section>
    </>
  )
}
