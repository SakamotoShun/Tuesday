import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryProvider } from "@/providers/query-provider"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { useSetup } from "@/hooks/use-setup"
import { SetupPage } from "@/pages/setup"
import { LoginPage } from "@/pages/login"
import { RegisterPage } from "@/pages/register"
import { HomePage } from "@/pages/home"
import { ProjectsPage } from "@/pages/projects"
import { ProjectDetailPage } from "@/pages/project-detail"
import { DocPage } from "@/pages/doc-page"
import { NotFoundPage } from "@/pages/not-found"
import { AdminPage } from "@/pages/admin"
import { MyCalendarPage } from "@/pages/my-calendar"
import { WhiteboardEditorPage } from "@/pages/whiteboard-editor"
import { MyWorkPage } from "@/pages/my-work"
import { ChatPage } from "@/pages/chat"
import { NotificationsPage } from "@/pages/notifications"
import { ProfilePage } from "@/pages/profile"

function AppRoutes() {
  const { isInitialized, isLoading } = useSetup()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Fresh install - redirect everything to setup page
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

  // Workspace already initialized - normal app routes
  return (
    <BrowserRouter>
      <Routes>
        {/* Setup page redirects to login since already initialized */}
        <Route path="/setup" element={<Navigate to="/login" replace />} />

        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes - require authentication */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id/docs/:docId" element={<DocPage />} />
          <Route path="projects/:id/*" element={<ProjectDetailPage />} />
          <Route path="my-work" element={<MyWorkPage />} />
          <Route path="my-calendar" element={<MyCalendarPage />} />
          <Route path="whiteboards/:id" element={<WhiteboardEditorPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>

        {/* 404 */}
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
