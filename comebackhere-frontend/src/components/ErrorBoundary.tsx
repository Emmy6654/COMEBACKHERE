import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <h2 className="error-boundary__title">
              {this.props.fallbackTitle ?? "Something went wrong"}
            </h2>
            <p className="error-boundary__message">
              An unexpected error occurred in this section. You can try again or
              reload the page.
            </p>
            {this.state.error && (
              <pre className="error-boundary__detail">
                {this.state.error.message}
              </pre>
            )}
            <button
              className="btn btn--primary"
              onClick={this.handleRetry}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
