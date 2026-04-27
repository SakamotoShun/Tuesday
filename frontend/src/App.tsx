import { lazy, Suspense, type ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { LoadingSpinner } from "@/components/common/loading-spinner"
import { AppLayout } from "@/components/layout/app-layout"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { QueryProvider } from "@/providers/query-provider"
import { useSetup } from "@/hooks/use-setup"
import { ForgotPasswordPage } from "@/pages/forgot-password"
import { HomePage } from "@/pages/home"
import { LoginPage } from "@/pages/login"
import { NotFoundPage } from "@/pages/not-found"
import { ProfilePage } from "@/pages/profile"
import { ProjectsPage } from "@/pages/projects"
import { RegisterPage } from "@/pages/register"
import { ResetPasswordPage } from "@/pages/reset-password"
import { SetupPage } from "@/pages/setup"

const ProjectDetailPage = lazy(() =>
  import("@/pages/project-detail").then((module) => ({ default: module.ProjectDetailPage }))
)
const DocPage = lazy(() =>
  import("@/pages/doc-page").then((module) => ({ default: module.DocPage }))
)
const WhiteboardEditorPage = lazy(() =>
  import("@/pages/whiteboard-editor").then((module) => ({
    default: module.WhiteboardEditorPage,
  }))
)
const MyCalendarPage = lazy(() =>
  import("@/pages/my-calendar").then((module) => ({ default: module.MyCalendarPage }))
)
const ChatPage = lazy(() =>
  import("@/pages/chat").then((module) => ({ default: module.ChatPage }))
)
const AdminPage = lazy(() =>
  import("@/pages/admin").then((module) => ({ default: module.AdminPage }))
)
const AdminPayrollPage = lazy(() =>
  import("@/pages/admin-payroll").then((module) => ({ default: module.AdminPayrollPage }))
)
const AdminDeveloperPage = lazy(() =>
  import("@/pages/admin-developer").then((module) => ({ default: module.AdminDeveloperPage }))
)
const MyWorkPage = lazy(() =>
  import("@/pages/my-work").then((module) => ({ default: module.MyWorkPage }))
)
const NotificationsPage = lazy(() =>
  import("@/pages/notifications").then((module) => ({ default: module.NotificationsPage }))
)
const HiringPage = lazy(() =>
  import("@/pages/hiring").then((module) => ({ default: module.HiringPage }))
)
const PositionDetailPage = lazy(() =>
  import("@/pages/position-detail").then((module) => ({ default: module.PositionDetailPage }))
)
const PoliciesPage = lazy(() =>
  import("@/pages/policies-page").then((module) => ({ default: module.PoliciesPage }))
)
const PolicyDatabasePage = lazy(() =>
  import("@/pages/policy-database-page").then((module) => ({ default: module.PolicyDatabasePage }))
)
const PolicyDocPage = lazy(() =>
  import("@/pages/policy-doc-page").then((module) => ({ default: module.PolicyDocPage }))
)
const SharedDocPage = lazy(() =>
  import("@/pages/shared-doc-page").then((module) => ({ default: module.SharedDocPage }))
)

function FullScreenLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}

interface RouteBoundaryProps {
  children: ReactNode
  title: string
  message: string
}

function RouteBoundary({ children, title, message }: RouteBoundaryProps) {
  const location = useLocation()

  return (
    <ErrorBoundary
      title={title}
      message={message}
      resetKeys={[location.pathname, location.search]}
      retryLabel="Reload page"
    >
      <Suspense fallback={<FullScreenLoading />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { isInitialized, isLoading } = useSetup()

  if (isLoading) {
    return <FullScreenLoading />
  }

  if (!isInitialized) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/shared/docs/:token"
          element={
            <RouteBoundary
              title="Shared doc unavailable"
              message="This shared document hit a rendering issue. Try reloading the page."
            >
              <SharedDocPage />
            </RouteBoundary>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <Suspense fallback={<FullScreenLoading />}>
                <OnboardingProvider>
                  <AppLayout />
                </OnboardingProvider>
              </Suspense>
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <RouteBoundary
                title="Home unavailable"
                message="This home view hit a rendering issue. Try reloading the page."
              >
                <HomePage />
              </RouteBoundary>
            }
          />
          <Route
            path="projects"
            element={
              <RouteBoundary
                title="Projects unavailable"
                message="This projects view hit a rendering issue. Try reloading the page."
              >
                <ProjectsPage />
              </RouteBoundary>
            }
          />
          <Route
            path="docs/personal/:docId"
            element={
              <RouteBoundary
                title="Doc unavailable"
                message="This document view hit a rendering issue. Try reloading the page."
              >
                <DocPage />
              </RouteBoundary>
            }
          />
          <Route
            path="projects/:id/docs/:docId"
            element={
              <RouteBoundary
                title="Doc unavailable"
                message="This document view hit a rendering issue. Try reloading the page."
              >
                <DocPage />
              </RouteBoundary>
            }
          />
          <Route
            path="projects/:id/*"
            element={
              <RouteBoundary
                title="Project unavailable"
                message="This project view hit a rendering issue. Try reloading the page."
              >
                <ProjectDetailPage />
              </RouteBoundary>
            }
          />
          <Route
            path="my-work"
            element={
              <RouteBoundary
                title="My work unavailable"
                message="This workspace view hit a rendering issue. Try reloading the page."
              >
                <MyWorkPage />
              </RouteBoundary>
            }
          />
          <Route
            path="my-calendar"
            element={
              <RouteBoundary
                title="Calendar unavailable"
                message="This calendar view hit a rendering issue. Try reloading the page."
              >
                <MyCalendarPage />
              </RouteBoundary>
            }
          />
          <Route
            path="whiteboards/:id"
            element={
              <RouteBoundary
                title="Whiteboard unavailable"
                message="This whiteboard hit a rendering issue. Try reloading the page."
              >
                <WhiteboardEditorPage />
              </RouteBoundary>
            }
          />
          <Route
            path="chat"
            element={
              <RouteBoundary
                title="Chat unavailable"
                message="This chat view hit a rendering issue. Try reloading the page."
              >
                <ChatPage />
              </RouteBoundary>
            }
          />
          <Route
            path="policies"
            element={
              <RouteBoundary
                title="Policies unavailable"
                message="This policies view hit a rendering issue. Try reloading the page."
              >
                <PoliciesPage />
              </RouteBoundary>
            }
          />
          <Route
            path="policies/:id"
            element={
              <RouteBoundary
                title="Database unavailable"
                message="This policy database hit a rendering issue. Try reloading the page."
              >
                <PolicyDatabasePage />
              </RouteBoundary>
            }
          />
          <Route
            path="policies/:id/:rowId"
            element={
              <RouteBoundary
                title="Policy doc unavailable"
                message="This policy doc hit a rendering issue. Try reloading the page."
              >
                <PolicyDocPage />
              </RouteBoundary>
            }
          />
          <Route
            path="notifications"
            element={
              <RouteBoundary
                title="Notifications unavailable"
                message="This notifications view hit a rendering issue. Try reloading the page."
              >
                <NotificationsPage />
              </RouteBoundary>
            }
          />
          <Route
            path="profile"
            element={
              <RouteBoundary
                title="Profile unavailable"
                message="This profile view hit a rendering issue. Try reloading the page."
              >
                <ProfilePage />
              </RouteBoundary>
            }
          />
          <Route
            path="hiring"
            element={
              <RouteBoundary
                title="Hiring unavailable"
                message="This hiring view hit a rendering issue. Try reloading the page."
              >
                <HiringPage />
              </RouteBoundary>
            }
          />
          <Route
            path="hiring/positions/:id"
            element={
              <RouteBoundary
                title="Position unavailable"
                message="This position view hit a rendering issue. Try reloading the page."
              >
                <PositionDetailPage />
              </RouteBoundary>
            }
          />
          <Route
            path="admin"
            element={
              <RouteBoundary
                title="Admin unavailable"
                message="This admin page hit a rendering issue. Try reloading the page."
              >
                <AdminPage />
              </RouteBoundary>
            }
          />
          <Route
            path="admin/payroll"
            element={
              <RouteBoundary
                title="Payroll unavailable"
                message="This payroll view hit a rendering issue. Try reloading the page."
              >
                <AdminPayrollPage />
              </RouteBoundary>
            }
          />
          <Route
            path="admin/developer"
            element={
              <RouteBoundary
                title="Developer settings unavailable"
                message="This developer settings view hit a rendering issue. Try reloading the page."
              >
                <AdminDeveloperPage />
              </RouteBoundary>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <QueryProvider>
      <AppRoutes />
    </QueryProvider>
  )
}

export default App
