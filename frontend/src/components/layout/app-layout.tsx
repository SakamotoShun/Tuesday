import { Outlet, useLocation } from "react-router-dom"
import { TopBar } from "./top-bar"
import { LeftRail } from "./left-rail"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { cn } from "@/lib/utils"

export function AppLayout() {
  const { pathname } = useLocation()
  const isImmersivePage = pathname.startsWith("/whiteboards/")

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftRail />
        <main
          className={cn(
            "flex flex-col flex-1 min-h-0",
            isImmersivePage ? "overflow-hidden p-0" : "overflow-auto p-8"
          )}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
