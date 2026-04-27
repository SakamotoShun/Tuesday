import { createRoot } from "react-dom/client"
import { ErrorBoundary } from "@/components/common/error-boundary"
import App from "./App"
import { ThemeProvider } from "./providers/theme-provider"
import "./index.css"

// StrictMode disabled to prevent double WebSocket connections in dev
// which causes "closed before established" errors with real-time collaboration
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ErrorBoundary
      title="App unavailable"
      message="The application hit a rendering issue before the page could fully load. Try reloading."
      retryLabel="Reload app"
    >
      <App />
    </ErrorBoundary>
  </ThemeProvider>
)
