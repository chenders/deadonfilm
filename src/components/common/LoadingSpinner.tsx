interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div data-testid="loading-spinner" className="flex flex-col items-center justify-center py-12">
      <div
        data-testid="spinner"
        className="animate-spin rounded-full h-12 w-12 border-4 border-beige border-t-brown-dark"
      />
      <p data-testid="loading-message" className="mt-4 text-text-muted">
        {message}
      </p>
    </div>
  )
}
