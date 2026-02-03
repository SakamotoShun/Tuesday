// User types
export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: "admin" | "member"
  isDisabled: boolean
  createdAt: string
  updatedAt: string
}

// Project types
export interface Project {
  id: string
  name: string
  client: string | null
  statusId: string | null
  ownerId: string
  type: string | null
  startDate: string | null
  targetEndDate: string | null
  createdAt: string
  updatedAt: string
  status?: ProjectStatus
  owner?: User
  members?: ProjectMember[]
}

export interface ProjectStatus {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
}

export interface ProjectMember {
  projectId: string
  userId: string
  role: "owner" | "member"
  joinedAt: string
  user?: User
}

// Setup types
export interface SetupStatus {
  initialized: boolean
}

export interface SetupInput {
  workspaceName: string
  adminEmail: string
  adminName: string
  adminPassword: string
}

// Auth types
export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  name: string
}

// API Response types
export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

export interface ApiError {
  code: string
  message: string
  details?: Array<{ field: string; message: string }>
}

// Create project input
export interface CreateProjectInput {
  name: string
  client?: string
  statusId?: string
  type?: string
  startDate?: string
  targetEndDate?: string
}

export interface UpdateProjectInput {
  name?: string
  client?: string | null
  statusId?: string | null
  type?: string | null
  startDate?: string | null
  targetEndDate?: string | null
}
