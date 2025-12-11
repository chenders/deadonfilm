import { useState } from "react"

interface CalculationExplainerProps {
  type: "movies" | "actors"
}

export default function CalculationExplainer({ type }: CalculationExplainerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-6 rounded-lg border border-brown-medium/20 bg-cream">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-display text-sm text-brown-dark">How is this calculated?</span>
        <span className="text-brown-medium">{isOpen ? "-" : "+"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-brown-medium/20 px-4 py-4 text-sm text-text-muted">
          {type === "movies" ? (
            <div className="space-y-4">
              <section>
                <h4 className="font-medium text-brown-dark">Expected Deaths</h4>
                <p>
                  For each actor in a film, we calculate the probability they would have died
                  between the movie's release and today using US Social Security Administration
                  actuarial life tables. This accounts for their age at the time of filming.
                </p>
                <p className="mt-1">
                  The sum of all individual death probabilities gives us the{" "}
                  <em>expected deaths</em> for the cast.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Curse Score</h4>
                <p>
                  The curse score measures how much higher the actual deaths are compared to
                  expected:
                </p>
                <p className="mt-1 rounded bg-beige px-2 py-1 font-mono text-xs">
                  Curse Score = (Actual Deaths - Expected Deaths) / Expected Deaths
                </p>
                <p className="mt-1">
                  A score of 50% means 50% more deaths than statistically expected. A score of 100%
                  means twice as many deaths as expected.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Why This Matters</h4>
                <p>
                  Without this calculation, old movies would always appear "cursed" simply because
                  their casts are elderly. A 1930s film with all deceased actors isn't unusual -
                  it's expected. This method identifies films with <em>unexpectedly</em> high
                  mortality.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Exclusions</h4>
                <p>
                  Actors appearing via archived footage (those who died more than 3 years before the
                  film's release) are excluded from calculations, as they weren't alive during
                  production.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <section>
                <h4 className="font-medium text-brown-dark">How It Works</h4>
                <p>
                  For each movie an actor appeared in, we calculate how many of their co-stars have
                  died versus how many would be expected to die based on actuarial data.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Curse Score</h4>
                <p>
                  We sum up the expected and actual deaths across all of an actor's films, then
                  calculate:
                </p>
                <p className="mt-1 rounded bg-beige px-2 py-1 font-mono text-xs">
                  Curse Score = (Total Actual Deaths - Total Expected Deaths) / Total Expected
                  Deaths
                </p>
                <p className="mt-1">
                  A score of 50% means their co-stars died at 1.5x the expected rate across their
                  career.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Expected Deaths</h4>
                <p>
                  For each co-star, we use US Social Security Administration actuarial life tables
                  to calculate the probability they would have died between the film's release and
                  today, based on their age at filming.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Why This Matters</h4>
                <p>
                  Actors who primarily work in period dramas with older casts would appear "cursed"
                  without this adjustment. This method identifies actors whose co-stars died at
                  genuinely unusual rates, controlling for age.
                </p>
              </section>

              <section>
                <h4 className="font-medium text-brown-dark">Minimum Movies</h4>
                <p>
                  By default, actors need at least 2 analyzed movies to appear in rankings. This
                  prevents statistical flukes from dominating the list.
                </p>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
