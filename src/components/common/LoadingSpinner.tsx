interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-beige border-t-brown-dark" />
      <p className="mt-4 text-text-muted">{message}</p>
    </div>
  )
}
