import { FilmReelIcon } from "@/components/icons"

interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div
      data-testid="loading-spinner"
      role="status"
      className="flex flex-col items-center justify-center py-12"
    >
      {/* Film reel container with projector-style glow */}
      <div className="relative">
        {/* Subtle glow effect behind the reel */}
        <div className="absolute inset-0 animate-pulse">
          <div className="h-16 w-16 rounded-full bg-brown-medium/10 blur-md" />
        </div>

        {/* Spinning film reel */}
        <div data-testid="spinner" className="relative animate-[spin_2s_linear_infinite]">
          <FilmReelIcon size={56} className="text-brown-dark" />
        </div>
      </div>

      {/* Film strip decoration */}
      <div className="mt-4 flex items-center gap-1">
        <div className="flex gap-0.5">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-3 w-1.5 animate-pulse rounded-sm bg-brown-medium/30"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p data-testid="loading-message" className="mx-3 font-medium text-text-muted">
          {message}
        </p>
        <div className="flex gap-0.5">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-3 w-1.5 animate-pulse rounded-sm bg-brown-medium/30"
              style={{ animationDelay: `${(3 - i) * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
