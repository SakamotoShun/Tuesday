import type { Block } from "@blocknote/core"

// User types
export type UserRole = "admin" | "member" | "freelancer"

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: UserRole
  employmentType: "hourly" | "full_time"
  hourlyRate: number | null
  isDisabled: boolean
  onboardingCompletedAt: string | null
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
  budgetHours?: string | null
  isTemplate: boolean
  createdAt: string
  updatedAt: string
  totalLoggedHours?: number
  status?: ProjectStatus
  owner?: User
  members?: ProjectMember[]
  currentUserRole?: "owner" | "member" | null
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
  passwordResetEnabled: boolean
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

export interface ForgotPasswordInput {
  email: string
}

export interface ResetPasswordInput {
  token: string
  password: string
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

export interface SearchProjectResult {
  id: string
  name: string
  client: string | null
  updatedAt: string
}

export interface SearchDocResult {
  id: string
  title: string
  projectId: string | null
  projectName: string | null
  isPersonal: boolean
  snippet: string | null
  updatedAt: string
}

export interface SearchTaskResult {
  id: string
  title: string
  projectId: string
  projectName: string
  snippet: string | null
  updatedAt: string
}

export interface GlobalSearchResults {
  projects: SearchProjectResult[]
  docs: SearchDocResult[]
  tasks: SearchTaskResult[]
}

// Create project input
export interface CreateProjectInput {
  name: string
  client?: string
  statusId?: string
  type?: string
  startDate?: string
  targetEndDate?: string
  budgetHours?: number | null
  templateId?: string
}

export interface UpdateProjectInput {
  name?: string
  client?: string | null
  statusId?: string | null
  type?: string | null
  startDate?: string | null
  targetEndDate?: string | null
  budgetHours?: number | null
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

// Notice board types
export type NoticeBoardItemType = "announcement" | "todo"

export interface NoticeBoardItem {
  id: string
  type: NoticeBoardItemType
  title: string
  description: string | null
  createdBy: string
  assigneeId: string | null
  isCompleted: boolean
  completedBy: string | null
  completedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  createdByUser?: User | null
  assignee?: User | null
  completedByUser?: User | null
}

export interface CreateNoticeBoardItemInput {
  type: NoticeBoardItemType
  title: string
  description?: string | null
  assigneeId?: string | null
}

export interface UpdateNoticeBoardItemInput {
  type?: NoticeBoardItemType
  title?: string
  description?: string | null
  assigneeId?: string | null
  sortOrder?: number
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
  projectId: string | null
  title: string
  startTime: string
  endTime: string
  location: string | null
  link: string | null
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
  link?: string
  notesMd?: string
  attendeeIds?: string[]
  teamIds?: string[]
}

export interface UpdateMeetingInput {
  title?: string
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  link?: string | null
  notesMd?: string | null
  attendeeIds?: string[]
  teamIds?: string[]
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
  isPolicy: boolean
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

export interface DocShare {
  docId: string
  userId: string
  permission: "edit"
  sharedBy: string
  createdAt: string
  updatedAt: string
  user: Pick<User, "id" | "name" | "email" | "avatarUrl">
}

export interface UpdateDocSharesInput {
  userIds: string[]
}

export interface SharedDocShareLink {
  id: string
  token: string
  permission: "view"
  createdAt: string
}

export interface SharedDocView {
  doc: {
    id: string
    title: string
    content: Block[]
  }
  permission: "view"
}

// Admin Settings types
export interface AdminSettings {
  allowRegistration: boolean
  workspaceName: string
  siteUrl: string
  openaiApiKey: string
  openrouterApiKey: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  smtpSecure: boolean
}

export interface UpdateAdminSettingsInput {
  allowRegistration?: boolean
  workspaceName?: string
  siteUrl?: string
  openaiApiKey?: string
  openrouterApiKey?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  smtpFrom?: string
  smtpSecure?: boolean
}

export interface AdminCreateUserInput {
  email: string
  name: string
  role?: UserRole
  employmentType?: "hourly" | "full_time"
  hourlyRate?: number
  password?: string
}

export interface AdminUpdateUserInput {
  role?: UserRole
  employmentType?: "hourly" | "full_time"
  hourlyRate?: number | null
  isDisabled?: boolean
}

export interface PayrollSummaryItem {
  userId: string
  userName: string
  userEmail: string
  employmentType: "hourly" | "full_time"
  hourlyRate: number | null
  totalHours: number
  totalCost: number | null
  projectCount: number
}

export interface PayrollSummaryMeta {
  total: number
  page: number
  pageSize: number
  totals: {
    totalHours: number
    totalCost: number
    billableEmployees: number
  }
}

export interface PayrollBreakdownUser {
  userId: string
  userName: string
  userEmail: string
  employmentType: "hourly" | "full_time"
  hourlyRate: number | null
  projects: Array<{
    projectId: string
    projectName: string
    hours: number
    cost: number | null
    weeks: Array<{
      weekStart: string
      weekEnd: string
      hours: number
      cost: number | null
    }>
  }>
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
  type: "webhook" | "ai"
  provider: "openai" | "openrouter"
  systemPrompt: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

export interface OpenRouterModel {
  id: string
  name: string
  contextLength: number | null
}

export interface ChannelBot {
  id: string
  name: string
  avatarUrl: string | null
  type: "webhook" | "ai"
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
  sortOrder?: number
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

export type FavoriteEntityType = "project" | "task" | "doc"

export interface FavoriteItem {
  id: string
  entityType: FavoriteEntityType
  entityId: string
  title: string
  subtitle: string | null
  link: string
  projectId: string | null
  sortOrder: number
  createdAt: string
}

export interface DashboardStatusCount {
  statusId: string | null
  statusName: string
  color: string
  count: number
}

export interface DashboardStats {
  tasks: {
    total: number
    overdue: number
    dueThisWeek: number
    completedThisWeek: number
    byStatus: DashboardStatusCount[]
  }
  projects: {
    total: number
    byStatus: DashboardStatusCount[]
  }
  timeTracking: {
    hoursToday: number
    hoursThisWeek: number
  }
  unreadNotifications: number
}

export type ActivityEntityType = "project" | "task" | "doc" | "meeting" | "whiteboard"

export interface ActivityLogItem {
  id: string
  actorId: string
  action: string
  entityType: ActivityEntityType
  entityId: string
  entityName: string
  projectId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  actor?: Pick<User, "id" | "name" | "email" | "avatarUrl"> | null
  project?: Pick<Project, "id" | "name"> | null
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

// Time entry types
export interface TimeEntry {
  id: string
  projectId: string | null
  userId: string
  date: string
  hours: number
  note: string | null
  createdAt: string
  updatedAt: string
  project?: Pick<Project, "id" | "name">
  user?: Pick<User, "id" | "name" | "email" | "avatarUrl">
}

export interface UpsertTimeEntryInput {
  projectId?: string | null
  date: string
  hours: number
  note?: string
}

export interface WeeklyTimesheet {
  entries: TimeEntry[]
  weekStart: string
  weekEnd: string
}

export interface MonthlyOverviewWeek {
  weekNumber: number
  weekStart: string
  weekEnd: string
  projectTotals: Array<{ projectId: string | null; projectName: string; hours: number }>
  totalHours: number
}

export interface MonthlyOverview {
  year: number
  month: number
  weeks: MonthlyOverviewWeek[]
  projectTotals: Array<{ projectId: string | null; projectName: string; hours: number }>
  grandTotal: number
}

export interface ProjectMonthlyOverviewWeek {
  weekNumber: number
  weekStart: string
  weekEnd: string
  userTotals: Array<{ userId: string; userName: string; hours: number }>
  totalHours: number
}

export interface ProjectMonthlyOverview {
  year: number
  month: number
  weeks: ProjectMonthlyOverviewWeek[]
  userTotals: Array<{ userId: string; userName: string; hours: number }>
  grandTotal: number
}

export interface WorkspaceMonthlyOverviewWeek {
  weekNumber: number
  weekStart: string
  weekEnd: string
  userTotals: Array<{ userId: string; userName: string; hours: number }>
  totalHours: number
}

export interface WorkspaceMonthlyOverview {
  year: number
  month: number
  weeks: WorkspaceMonthlyOverviewWeek[]
  userTotals: Array<{ userId: string; userName: string; hours: number }>
  grandTotal: number
}

// Interview tracking types
export type JobPositionStatus = "open" | "on_hold" | "closed"
export type CandidateSource = "MyCareersFuture" | "Referal" | "Linkedin" | "Others"

export interface InterviewStage {
  id: string
  name: string
  color: string
  sortOrder: number
  isDefault: boolean
  createdAt: string
}

export interface JobPosition {
  id: string
  title: string
  department: string | null
  descriptionMd: string | null
  status: JobPositionStatus
  hiringManagerId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  hiringManager?: User | null
  createdByUser?: User | null
}

export interface PositionDoc {
  id: string
  positionId: string
  docId: string
  sortOrder: number
  createdBy: string
  createdAt: string
  position?: JobPosition
  doc?: Doc
  createdByUser?: User | null
}

export interface Candidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  resumeUrl: string | null
  source: CandidateSource | null
  notes: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  createdByUser?: User | null
  applications?: JobApplication[]
}

export interface JobApplication {
  id: string
  candidateId: string
  positionId: string
  stageId: string | null
  sortOrder: number
  appliedAt: string
  createdBy: string
  updatedAt: string
  candidate?: Candidate
  position?: JobPosition
  stage?: InterviewStage | null
  createdByUser?: User | null
  interviews?: Interview[]
  notes?: InterviewNote[]
}

export interface Interview {
  id: string
  applicationId: string
  interviewerId: string | null
  scheduledAt: string | null
  durationMinutes: number | null
  type: string | null
  location: string | null
  link: string | null
  rating: number | null
  feedback: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  application?: JobApplication
  interviewer?: User | null
  createdByUser?: User | null
  notes?: InterviewNote[]
}

export interface InterviewNote {
  id: string
  applicationId: string | null
  interviewId: string | null
  docId: string
  title: string
  content: Block[]
  createdBy: string
  createdAt: string
  updatedAt: string
  createdByUser?: User | null
  doc?: Pick<Doc, "id" | "title" | "updatedAt"> | null
}

export interface CreateJobPositionInput {
  title: string
  department?: string | null
  status?: JobPositionStatus
  hiringManagerId?: string | null
}

export interface UpdateJobPositionInput {
  title?: string
  department?: string | null
  status?: JobPositionStatus
  hiringManagerId?: string | null
}

export interface CreatePositionDocInput {
  title: string
  content?: Block[]
}

export interface CreateCandidateInput {
  name: string
  email?: string | null
  phone?: string | null
  resumeUrl?: string | null
  source?: CandidateSource | null
  notes?: string | null
}

export interface UpdateCandidateInput {
  name?: string
  email?: string | null
  phone?: string | null
  resumeUrl?: string | null
  source?: CandidateSource | null
  notes?: string | null
}

export interface CreateJobApplicationInput {
  candidateId: string
  positionId: string
  stageId?: string
}

export interface MoveApplicationInput {
  stageId: string
  sortOrder?: number
}

export interface CreateInterviewInput {
  applicationId: string
  interviewerId?: string | null
  scheduledAt?: string | null
  durationMinutes?: number | null
  type?: string | null
  location?: string | null
  link?: string | null
  rating?: number | null
  feedback?: string | null
}

export interface UpdateInterviewInput {
  interviewerId?: string | null
  scheduledAt?: string | null
  durationMinutes?: number | null
  type?: string | null
  location?: string | null
  link?: string | null
  rating?: number | null
  feedback?: string | null
}

export interface CreateInterviewNoteInput {
  applicationId?: string | null
  interviewId?: string | null
  title: string
  content?: Block[]
}

export interface UpdateInterviewNoteInput {
  title?: string
  content?: Block[]
}
