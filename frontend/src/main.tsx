import { createRoot } from "react-dom/client"
import App from "./App"
import { ThemeProvider } from "./providers/theme-provider"
import "./index.css"

// StrictMode disabled to prevent double WebSocket connections in dev
// which causes "closed before established" errors with real-time collaboration
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
)
