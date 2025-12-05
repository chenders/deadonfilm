import { Link } from 'react-router-dom'

interface ErrorMessageProps {
  message: string
  showHomeLink?: boolean
}

export default function ErrorMessage({ message, showHomeLink = true }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-4">💀</div>
      <h2 className="text-xl font-display text-brown-dark mb-2">Something went wrong</h2>
      <p className="text-text-muted mb-4">{message}</p>
      {showHomeLink && (
        <Link to="/" className="text-brown-medium underline hover:text-brown-dark">
          Return to search
        </Link>
      )}
    </div>
  )
}
