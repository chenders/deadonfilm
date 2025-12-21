import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { useTrivia } from "@/hooks/useTrivia"

export default function TriviaFacts() {
  const { data, isLoading, error } = useTrivia()
  const [currentIndex, setCurrentIndex] = useState(0)

  // Shuffle facts on initial load for variety
  const shuffledFacts = useMemo(() => {
    if (!data?.facts) return []
    // Fisher-Yates shuffle
    const facts = [...data.facts]
    for (let i = facts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[facts[i], facts[j]] = [facts[j], facts[i]]
    }
    return facts
  }, [data?.facts])

  if (isLoading) {
    return (
      <section data-testid="trivia-facts" className="mt-8">
        <div className="animate-pulse rounded-lg bg-beige p-4">
          <div className="mb-2 h-5 w-32 rounded bg-brown-medium/20" />
          <div className="h-4 w-3/4 rounded bg-brown-medium/20" />
        </div>
      </section>
    )
  }

  if (error || !shuffledFacts.length) {
    return null
  }

  const currentFact = shuffledFacts[currentIndex]
  const hasMultipleFacts = shuffledFacts.length > 1

  const nextFact = () => {
    setCurrentIndex((prev) => (prev + 1) % shuffledFacts.length)
  }

  const prevFact = () => {
    setCurrentIndex((prev) => (prev - 1 + shuffledFacts.length) % shuffledFacts.length)
  }

  return (
    <section data-testid="trivia-facts" className="mt-8">
      <div className="rounded-lg bg-beige p-4">
        <div className="flex items-center justify-between">
          <h2 data-testid="trivia-title" className="font-display text-lg text-brown-dark">
            Did You Know?
          </h2>
          {hasMultipleFacts && (
            <div className="flex items-center gap-2">
              <button
                onClick={prevFact}
                data-testid="trivia-prev"
                className="rounded px-2 py-1 text-sm text-brown-medium hover:bg-cream"
                aria-label="Previous fact"
              >
                &larr;
              </button>
              <span className="text-xs text-text-muted">
                {currentIndex + 1} / {shuffledFacts.length}
              </span>
              <button
                onClick={nextFact}
                data-testid="trivia-next"
                className="rounded px-2 py-1 text-sm text-brown-medium hover:bg-cream"
                aria-label="Next fact"
              >
                &rarr;
              </button>
            </div>
          )}
        </div>

        <div data-testid="trivia-content" className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-brown-medium">
            {currentFact.title}
          </p>
          {currentFact.link ? (
            <Link
              to={currentFact.link}
              data-testid="trivia-link"
              className="mt-1 block text-sm text-brown-dark hover:text-accent hover:underline"
            >
              {currentFact.value}
            </Link>
          ) : (
            <p className="mt-1 text-sm text-brown-dark">{currentFact.value}</p>
          )}
        </div>
      </div>
    </section>
  )
}
