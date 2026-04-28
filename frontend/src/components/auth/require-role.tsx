import { Navigate } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"
import type { User } from "@/api/types"

interface RequireRoleProps {
  role: User["role"]
  children: React.ReactNode
}

export function RequireRole({ role, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || user.role !== role) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
