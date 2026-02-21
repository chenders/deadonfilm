import { Component, type ErrorInfo, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
  /** Fallback UI to render when an error is caught */
  fallback?: ReactNode
  /** Called when an error is caught — use for logging */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Generic error boundary that catches render errors in its subtree.
 * Prevents a single component failure from crashing the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)

    if (typeof window !== "undefined" && window.newrelic) {
      window.newrelic.noticeError(error, {
        componentStack: errorInfo.componentStack ?? "",
      })
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[200px] items-center justify-center p-8 text-center">
          <div>
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Something went wrong</h2>
            <p className="text-text-secondary text-sm">
              An error occurred while rendering this section. Try refreshing the page.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
