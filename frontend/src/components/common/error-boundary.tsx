import { Component, type ErrorInfo, type ReactNode } from "react"
import { ErrorDisplay } from "@/components/common/error-display"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, info)
    this.setState({ hasError: true })
  }

  override render() {
    if (this.state.hasError) {
      return <ErrorDisplay title="Something went wrong" message="Please refresh and try again." />
    }

    return this.props.children
  }
}
