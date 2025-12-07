import { Link } from "react-router-dom"

interface ErrorMessageProps {
  message: string
  showHomeLink?: boolean
}

export default function ErrorMessage({ message, showHomeLink = true }: ErrorMessageProps) {
  return (
    <div data-testid="error-message" className="flex flex-col items-center justify-center py-12 text-center">
      <div data-testid="error-icon" className="text-4xl mb-4">💀</div>
      <h2 data-testid="error-title" className="text-xl font-display text-brown-dark mb-2">Something went wrong</h2>
      <p data-testid="error-text" className="text-text-muted mb-4">{message}</p>
      {showHomeLink && (
        <Link data-testid="home-return-link" to="/" className="text-brown-medium underline hover:text-brown-dark">
          Return to search
        </Link>
      )}
    </div>
  )
}
