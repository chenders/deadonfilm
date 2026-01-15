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
      <div className="max-w-md rounded-lg border-2 border-brown-medium/30 bg-beige p-8 shadow-lg dark:border-[#4a3d32] dark:bg-[#2a221c]">
        {/* Film strip decoration top */}
        <div className="mb-4 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-2 w-3 rounded-sm bg-brown-medium/20" />
          ))}
        </div>

        <div data-testid="error-icon" className="mb-4">
          <SkullIcon size={48} className="mx-auto text-accent" />
        </div>

        <h2
          data-testid="error-title"
          className="mb-1 font-display text-lg uppercase tracking-wider text-brown-dark dark:text-[#d4c8b5]"
        >
          Technical Difficulties
        </h2>
        <p className="mb-3 text-xs italic text-brown-medium dark:text-[#9a8b7a]">
          The projector has jammed
        </p>

        <p data-testid="error-text" className="mb-4 text-text-muted dark:text-[#9a8b7a]">
          {message}
        </p>

        {showHomeLink && (
          <Link
            data-testid="home-return-link"
            to="/"
            className="inline-flex items-center gap-2 text-brown-medium transition-colors hover:text-brown-dark dark:text-[#9a8b7a] dark:hover:text-[#d4c8b5]"
          >
            <FilmReelIcon size={16} />
            <span className="underline">Return to search</span>
          </Link>
        )}

        {/* Film strip decoration bottom */}
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-2 w-3 rounded-sm bg-brown-medium/20" />
          ))}
        </div>
      </div>
    </div>
  )
}
