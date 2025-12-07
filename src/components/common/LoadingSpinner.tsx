import { FilmReelIcon } from "@/components/icons"

interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div data-testid="loading-spinner" className="flex flex-col items-center justify-center py-12">
      <div data-testid="spinner" className="animate-spin">
        <FilmReelIcon size={48} className="text-brown-dark" />
      </div>
      <p data-testid="loading-message" className="mt-4 text-text-muted">
        {message}
      </p>
    </div>
  )
}
