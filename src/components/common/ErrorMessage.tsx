import { Link } from "react-router-dom"
import { SkullIcon, FilmReelIcon } from "@/components/icons"

interface ErrorMessageProps {
  message: string
  showHomeLink?: boolean
}

export default function ErrorMessage({ message, showHomeLink = true }: ErrorMessageProps) {
  return (
    <div
      data-testid="error-message"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      {/* Vintage film card styling */}
      <div className="bg-beige border-2 border-brown-medium/30 rounded-lg p-8 max-w-md shadow-lg">
        {/* Film strip decoration top */}
        <div className="flex justify-center gap-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-3 h-2 bg-brown-medium/20 rounded-sm" />
          ))}
        </div>

        <div data-testid="error-icon" className="mb-4">
          <SkullIcon size={48} className="text-accent mx-auto" />
        </div>

        <h2
          data-testid="error-title"
          className="text-lg font-display text-brown-dark mb-1 tracking-wider uppercase"
        >
          Technical Difficulties
        </h2>
        <p className="text-xs text-brown-medium mb-3 italic">The projector has jammed</p>

        <p data-testid="error-text" className="text-text-muted mb-4">
          {message}
        </p>

        {showHomeLink && (
          <Link
            data-testid="home-return-link"
            to="/"
            className="inline-flex items-center gap-2 text-brown-medium hover:text-brown-dark transition-colors"
          >
            <FilmReelIcon size={16} />
            <span className="underline">Return to search</span>
          </Link>
        )}

        {/* Film strip decoration bottom */}
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-3 h-2 bg-brown-medium/20 rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  )
}
