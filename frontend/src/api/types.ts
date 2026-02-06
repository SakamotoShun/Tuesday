import type { Block } from "@blocknote/core"

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
  isTemplate: boolean
  createdAt: string
  updatedAt: string
  status?: ProjectStatus
  owner?: User
  members?: ProjectMember[]
}

export interface ProjectTemplate extends Project {
  docCount: number
  taskCount: number
  channelCount: number
  whiteboardCount: number
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
  source: "direct" | "team"
  sourceTeamId?: string | null
  joinedAt: string
  user?: User
  sourceTeam?: { id: string; name: string } | null
}

// Team types
export interface Team {
  id: string
  name: string
  description?: string | null
  createdAt: string
  updatedAt: string
  memberCount?: number
  projectCount?: number
}

export interface TeamMember {
  teamId: string
  userId: string
  role: "lead" | "member"
  joinedAt: string
  user?: User
}

export interface TeamProject {
  teamId: string
  projectId: string
  assignedAt: string
  project?: { id: string; name: string }
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
  templateId?: string
}

export interface UpdateProjectInput {
  name?: string
  client?: string | null
  statusId?: string | null
  type?: string | null
  startDate?: string | null
  targetEndDate?: string | null
}

// Task types
export interface TaskStatus {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
}

export interface Task {
  id: string
  projectId: string
  title: string
  description: string | null
  statusId: string | null
  startDate: string | null
  dueDate: string | null
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
  status?: TaskStatus
  project?: Project
  assignees?: User[]
  createdByUser?: User
}

export interface CreateTaskInput {
  title: string
  description?: string
  statusId?: string
  startDate?: string
  dueDate?: string
  assigneeIds?: string[]
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  statusId?: string | null
  startDate?: string | null
  dueDate?: string | null
  assigneeIds?: string[]
}

export interface UpdateTaskStatusInput {
  statusId: string
}

export interface UpdateTaskOrderInput {
  sortOrder: number
}

export interface UpdateTaskAssigneesInput {
  assigneeIds: string[]
}

// Meeting types
export interface MeetingAttendee {
  meetingId: string
  userId: string
  responded: boolean
  response: "pending" | "accepted" | "declined" | "tentative"
  user?: User
}

export interface Meeting {
  id: string
  projectId: string
  title: string
  startTime: string
  endTime: string
  location: string | null
  notesMd: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  attendees?: MeetingAttendee[]
  project?: Project
  createdByUser?: User
}

export interface CreateMeetingInput {
  title: string
  startTime: string
  endTime: string
  location?: string
  notesMd?: string
  attendeeIds?: string[]
}

export interface UpdateMeetingInput {
  title?: string
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  notesMd?: string | null
  attendeeIds?: string[]
}

// Doc types
export type PropertyType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "checkbox"
  | "url"

export interface SchemaColumn {
  id: string
  name: string
  type: PropertyType
  width?: number
  options?: string[]
}

export interface DatabaseSchema {
  columns: SchemaColumn[]
}

export type PropertyValue = string | number | boolean | string[] | null

export interface Doc {
  id: string
  projectId: string | null
  parentId: string | null
  title: string
  content: Block[]
  properties: Record<string, PropertyValue> | null
  isDatabase: boolean
  schema: DatabaseSchema | null
  createdBy: string
  createdAt: string
  updatedAt: string
  createdByUser?: User
  parent?: Doc | null
}

export interface DocWithChildren extends Doc {
  children: Doc[]
}

export interface CreateDocInput {
  title: string
  content?: Block[]
  parentId?: string | null
  isDatabase?: boolean
  schema?: DatabaseSchema | null
  properties?: Record<string, PropertyValue>
}

export interface UpdateDocInput {
  title?: string
  content?: Block[]
  parentId?: string | null
  schema?: DatabaseSchema | null
  properties?: Record<string, PropertyValue>
}

// Admin Settings types
export interface AdminSettings {
  allowRegistration: boolean
  workspaceName: string
  siteUrl: string
}

export interface UpdateAdminSettingsInput {
  allowRegistration?: boolean
  workspaceName?: string
  siteUrl?: string
}

export interface AdminCreateUserInput {
  email: string
  name: string
  role?: "admin" | "member"
  password?: string
}

export interface AdminUpdateUserInput {
  role?: "admin" | "member"
  isDisabled?: boolean
}

export interface AdminCreateUserResponse extends User {
  temporaryPassword?: string
}

export interface AdminUserOwnerships {
  ownedProjects: Array<{ id: string; name: string; ownerId: string }>
  createdContent: {
    docs: number
    tasks: number
    meetings: number
    whiteboards: number
    docCollabUpdates: number
    whiteboardCollabUpdates: number
  }
  isLastAdmin: boolean
}

export interface AdminDeleteUserInput {
  projectTransfers: Array<{ projectId: string; newOwnerId: string }>
  reassignToUserId?: string
}

export interface Bot {
  id: string
  name: string
  avatarUrl: string | null
  webhookToken: string
  createdBy: string
  isDisabled: boolean
  createdAt: string
  updatedAt: string
}

export interface BotChannelMember {
  botId: string
  channelId: string
  addedBy: string
  addedAt: string
  channel?: Channel
}

// Chat types
export interface Channel {
  id: string
  name: string
  description?: string | null
  type: "workspace" | "project" | "dm"
  access: "public" | "private" | "invite_only"
  projectId: string | null
  createdAt: string
  archivedAt?: string | null
  project?: Project | null
  unreadCount?: number
  lastReadAt?: string | null
  otherUser?: User | null
}

export interface CreateChannelInput {
  name: string
  projectId?: string | null
  type?: "workspace" | "project"
  access?: "public" | "private" | "invite_only"
  description?: string | null
  memberIds?: string[]
}

export interface UpdateChannelInput {
  name?: string
  description?: string | null
}

export interface CreateDMInput {
  userId: string
}

export interface ChannelMember {
  userId: string
  role: "owner" | "member"
  joinedAt: string
  lastReadAt: string
  user: User
}

export interface AddChannelMembersInput {
  userIds: string[]
}

export interface Message {
  id: string
  channelId: string
  userId: string
  botId?: string | null
  content: string
  mentions: string[]
  createdAt: string
  updatedAt: string
  editedAt?: string | null
  deletedAt?: string | null
  user?: User
  bot?: Pick<Bot, "id" | "name" | "avatarUrl"> | null
  attachments?: FileAttachment[]
  reactions?: MessageReaction[]
}

export interface CreateMessageInput {
  content?: string
  attachmentIds?: string[]
}

export interface UpdateMessageInput {
  content: string
}

export interface FileAttachment {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy: string
  url: string
}

export interface MessageReaction {
  id: string
  emoji: string
  userId: string
  createdAt: string
}

// Notification types
export type NotificationType = "mention" | "assignment" | "meeting_invite" | "project_invite"

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

// Whiteboard types
export interface Whiteboard {
  id: string
  projectId: string
  name: string
  data: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
  createdByUser?: User
}

export interface CreateWhiteboardInput {
  name: string
  data?: Record<string, unknown>
}

export interface UpdateWhiteboardInput {
  name?: string
  data?: Record<string, unknown> | null
}
