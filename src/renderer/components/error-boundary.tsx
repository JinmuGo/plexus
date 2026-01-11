/**
 * Error Boundary
 *
 * React Error Boundary component for graceful error handling.
 * Catches JavaScript errors in child component tree and displays fallback UI.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { devLog } from 'renderer/lib/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback component to render on error */
  fallback?: ReactNode
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      devLog.error('[ErrorBoundary] Caught error:', error)
      devLog.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    }

    // Call optional error callback
    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>

            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>

            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. You can try to recover or reload the
              app.
            </p>

            {/* Error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Error details
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">
                  <code>
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack}
                  </code>
                </pre>
              </details>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button onClick={this.handleReset} size="sm" variant="outline">
                Try again
              </Button>
              <Button onClick={this.handleReload} size="sm" variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload app
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Simple error fallback component for minimal error display
 */
export function ErrorFallback({
  error,
  resetError,
}: {
  error?: Error
  resetError?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
      <p className="text-sm text-muted-foreground mb-3">
        {error?.message || 'Something went wrong'}
      </p>
      {resetError && (
        <Button onClick={resetError} size="sm" variant="outline">
          Try again
        </Button>
      )}
    </div>
  )
}
