import { Component, type ErrorInfo, type ReactNode } from "react"
import { ErrorDisplay } from "@/components/common/error-display"
import { getLastRequestId } from "@/api/client"

interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
  message?: string
  retryLabel?: string
  resetKeys?: Array<string | number | boolean | null | undefined>
}

interface ErrorBoundaryState {
  hasError: boolean
  requestId: string | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, requestId: null }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) {
      return
    }

    if (!haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      return
    }

    this.setState({ hasError: false, requestId: null })
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, info)
    this.setState({ hasError: true, requestId: getLastRequestId() })
  }

  private handleRetry = () => {
    this.setState({ hasError: false, requestId: null })
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          title={this.props.title ?? "Something went wrong"}
          message={this.props.message ?? "Please refresh and try again."}
          onRetry={this.handleRetry}
          requestId={this.state.requestId}
          retryLabel={this.props.retryLabel ?? "Reload section"}
        />
      )
    }

    return this.props.children
  }
}

function haveResetKeysChanged(
  previous: ErrorBoundaryProps["resetKeys"],
  next: ErrorBoundaryProps["resetKeys"]
) {
  if (previous === next) {
    return false
  }

  if (!previous || !next || previous.length !== next.length) {
    return true
  }

  return previous.some((value, index) => value !== next[index])
}
