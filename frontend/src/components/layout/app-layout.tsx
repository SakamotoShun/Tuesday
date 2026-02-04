import { Outlet } from "react-router-dom"
import { TopBar } from "./top-bar"
import { LeftRail } from "./left-rail"
import { ErrorBoundary } from "@/components/common/error-boundary"

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <main className="flex-1 overflow-auto p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
