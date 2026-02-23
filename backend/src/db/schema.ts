import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, date, primaryKey, bigserial, bigint, customType, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// User roles
export const UserRole = {
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

// Employment types
export const EmploymentType = {
  HOURLY: 'hourly',
  FULL_TIME: 'full_time',
} as const;

export type EmploymentType = typeof EmploymentType[keyof typeof EmploymentType];

// Project member roles
export const ProjectMemberRole = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export type ProjectMemberRole = typeof ProjectMemberRole[keyof typeof ProjectMemberRole];

// Team member roles
export const TeamMemberRole = {
  LEAD: 'lead',
  MEMBER: 'member',
} as const;

export type TeamMemberRole = typeof TeamMemberRole[keyof typeof TeamMemberRole];

// Project member source
export const ProjectMemberSource = {
  DIRECT: 'direct',
  TEAM: 'team',
} as const;

export type ProjectMemberSource = typeof ProjectMemberSource[keyof typeof ProjectMemberSource];

// Channel types
export const ChannelType = {
  WORKSPACE: 'workspace',
  PROJECT: 'project',
  DM: 'dm',
} as const;

export type ChannelType = typeof ChannelType[keyof typeof ChannelType];

// Channel access levels
export const ChannelAccess = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  INVITE_ONLY: 'invite_only',
} as const;

export type ChannelAccess = typeof ChannelAccess[keyof typeof ChannelAccess];

// Channel member roles
export const ChannelMemberRole = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export type ChannelMemberRole = typeof ChannelMemberRole[keyof typeof ChannelMemberRole];

// Activity entity types
export const ActivityEntityType = {
  PROJECT: 'project',
  TASK: 'task',
  DOC: 'doc',
  MEETING: 'meeting',
  WHITEBOARD: 'whiteboard',
} as const;

export type ActivityEntityType = typeof ActivityEntityType[keyof typeof ActivityEntityType];

// Favorite entity types
export const FavoriteEntityType = {
  PROJECT: 'project',
  TASK: 'task',
  DOC: 'doc',
} as const;

export type FavoriteEntityType = typeof FavoriteEntityType[keyof typeof FavoriteEntityType];

// Notice board item types
export const NoticeBoardItemType = {
  ANNOUNCEMENT: 'announcement',
  TODO: 'todo',
} as const;

export type NoticeBoardItemType = typeof NoticeBoardItemType[keyof typeof NoticeBoardItemType];

// Job position statuses
export const JobPositionStatus = {
  OPEN: 'open',
  ON_HOLD: 'on_hold',
  CLOSED: 'closed',
} as const;

export type JobPositionStatus = typeof JobPositionStatus[keyof typeof JobPositionStatus];

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  role: varchar('role', { length: 20 }).notNull().default(UserRole.MEMBER),
  employmentType: varchar('employment_type', { length: 20 }).notNull().default(EmploymentType.FULL_TIME),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }),
  isDisabled: boolean('is_disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Bot types
export const BotType = {
  WEBHOOK: 'webhook',
  AI: 'ai',
} as const;

export type BotType = typeof BotType[keyof typeof BotType];

export const AiProvider = {
  OPENAI: 'openai',
  OPENROUTER: 'openrouter',
} as const;

export type AiProvider = typeof AiProvider[keyof typeof AiProvider];

// Bots table
export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  webhookToken: varchar('webhook_token', { length: 128 }).notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isDisabled: boolean('is_disabled').notNull().default(false),
  type: varchar('type', { length: 20 }).notNull().default(BotType.WEBHOOK),
  provider: varchar('provider', { length: 20 }).notNull().default(AiProvider.OPENAI),
  systemPrompt: text('system_prompt'),
  model: varchar('model', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Settings table (key-value store)
export const settings = pgTable('settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Project statuses table
export const projectStatuses = pgTable('project_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull().default('#6b7280'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Projects table
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  client: varchar('client', { length: 255 }),
  statusId: uuid('status_id').references(() => projectStatuses.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  type: varchar('type', { length: 50 }),
  startDate: date('start_date'),
  targetEndDate: date('target_end_date'),
  isTemplate: boolean('is_template').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Teams table
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Project members table
export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default(ProjectMemberRole.MEMBER),
  source: varchar('source', { length: 20 }).notNull().default(ProjectMemberSource.DIRECT),
  sourceTeamId: uuid('source_team_id').references(() => teams.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.userId] }),
}));

// Team members table
export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default(TeamMemberRole.MEMBER),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.userId] }),
}));

// Team projects table
export const teamProjects = pgTable('team_projects', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.projectId] }),
}));

// Chat channels table
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  type: varchar('type', { length: 20 }).notNull().default(ChannelType.PROJECT),
  access: varchar('access', { length: 20 }).notNull().default(ChannelAccess.PUBLIC),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chat messages table
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  botId: uuid('bot_id').references(() => bots.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  mentions: uuid('mentions').array().notNull().default([]),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Channel members table
export const channelMembers = pgTable('channel_members', {
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default(ChannelMemberRole.MEMBER),
  sortOrder: integer('sort_order').notNull().default(0),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.channelId, table.userId] }),
}));

// Bot channel members table
export const botChannelMembers = pgTable('bot_channel_members', {
  botId: uuid('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  addedBy: uuid('added_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.botId, table.channelId] }),
}));

// Files table
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storedName: varchar('stored_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  storagePath: text('storage_path').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Message attachments table
export const messageAttachments = pgTable('message_attachments', {
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.messageId, table.fileId] }),
}));

// Message reactions table
export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Docs table
export const docs = pgTable('docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  title: varchar('title', { length: 255 }).notNull(),
  content: jsonb('content').notNull().default([]),
  searchText: text('search_text').notNull().default(''),
  properties: jsonb('properties').default({}),
  isDatabase: boolean('is_database').notNull().default(false),
  schema: jsonb('schema'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Doc collaboration snapshots
export const docCollabSnapshots = pgTable('doc_collab_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  snapshot: bytea('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Doc collaboration updates
export const docCollabUpdates = pgTable('doc_collab_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  update: bytea('update').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Activity logs table
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  entityName: varchar('entity_name', { length: 255 }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  actorIdx: index('activity_logs_actor_id_idx').on(table.actorId),
  projectIdx: index('activity_logs_project_id_idx').on(table.projectId),
  createdIdx: index('activity_logs_created_at_idx').on(table.createdAt),
}));

// Favorites table
export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userSortIdx: index('favorites_user_sort_order_idx').on(table.userId, table.sortOrder),
  uniqueUserEntity: uniqueIndex('favorites_user_entity_unique').on(table.userId, table.entityType, table.entityId),
}));

// Notice board items table
export const noticeBoardItems = pgTable('notice_board_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 20 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  isCompleted: boolean('is_completed').notNull().default(false),
  completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sortCreatedIdx: index('notice_board_items_sort_created_idx').on(table.sortOrder, table.createdAt),
  typeIdx: index('notice_board_items_type_idx').on(table.type),
  assigneeIdx: index('notice_board_items_assignee_id_idx').on(table.assigneeId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projectMembers),
  teams: many(teamMembers),
  createdProjects: many(projects, { relationName: 'createdProjects' }),
  sessions: many(sessions),
  activityLogs: many(activityLogs),
  favorites: many(favorites),
  createdNoticeBoardItems: many(noticeBoardItems, { relationName: 'createdNoticeBoardItems' }),
  assignedNoticeBoardItems: many(noticeBoardItems, { relationName: 'assignedNoticeBoardItems' }),
  completedNoticeBoardItems: many(noticeBoardItems, { relationName: 'completedNoticeBoardItems' }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  status: one(projectStatuses, {
    fields: [projects.statusId],
    references: [projectStatuses.id],
  }),
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
    relationName: 'createdProjects',
  }),
  members: many(projectMembers),
  activityLogs: many(activityLogs),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  projects: many(teamProjects),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
  sourceTeam: one(teams, {
    fields: [projectMembers.sourceTeamId],
    references: [teams.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const teamProjectsRelations = relations(teamProjects, ({ one }) => ({
  team: one(teams, {
    fields: [teamProjects.teamId],
    references: [teams.id],
  }),
  project: one(projects, {
    fields: [teamProjects.projectId],
    references: [projects.id],
  }),
}));

export const docsRelations = relations(docs, ({ one, many }) => ({
  project: one(projects, {
    fields: [docs.projectId],
    references: [projects.id],
  }),
  parent: one(docs, {
    fields: [docs.parentId],
    references: [docs.id],
    relationName: 'parent',
  }),
  children: many(docs, { relationName: 'parent' }),
  createdBy: one(users, {
    fields: [docs.createdBy],
    references: [users.id],
  }),
  collabSnapshots: many(docCollabSnapshots),
  collabUpdates: many(docCollabUpdates),
}));

// Chat relations
export const botsRelations = relations(bots, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [bots.createdBy],
    references: [users.id],
  }),
  messages: many(messages),
  channelMembers: many(botChannelMembers),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  project: one(projects, {
    fields: [channels.projectId],
    references: [projects.id],
  }),
  messages: many(messages),
  members: many(channelMembers),
  botMembers: many(botChannelMembers),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  bot: one(bots, {
    fields: [messages.botId],
    references: [bots.id],
  }),
  attachments: many(messageAttachments),
  reactions: many(messageReactions),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(channels, {
    fields: [channelMembers.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [channelMembers.userId],
    references: [users.id],
  }),
}));

export const botChannelMembersRelations = relations(botChannelMembers, ({ one }) => ({
  bot: one(bots, {
    fields: [botChannelMembers.botId],
    references: [bots.id],
  }),
  channel: one(channels, {
    fields: [botChannelMembers.channelId],
    references: [channels.id],
  }),
  addedBy: one(users, {
    fields: [botChannelMembers.addedBy],
    references: [users.id],
  }),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  uploadedBy: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  attachments: many(messageAttachments),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id],
  }),
  file: one(files, {
    fields: [messageAttachments.fileId],
    references: [files.id],
  }),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, {
    fields: [messageReactions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReactions.userId],
    references: [users.id],
  }),
}));

export const docCollabSnapshotsRelations = relations(docCollabSnapshots, ({ one }) => ({
  doc: one(docs, {
    fields: [docCollabSnapshots.docId],
    references: [docs.id],
  }),
}));

export const docCollabUpdatesRelations = relations(docCollabUpdates, ({ one }) => ({
  doc: one(docs, {
    fields: [docCollabUpdates.docId],
    references: [docs.id],
  }),
  actor: one(users, {
    fields: [docCollabUpdates.actorId],
    references: [users.id],
  }),
}));

// Task statuses table
export const taskStatuses = pgTable('task_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull().default('#6b7280'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tasks table
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  descriptionMd: text('description_md').default(''),
  statusId: uuid('status_id').references(() => taskStatuses.id),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Task assignees table (junction table)
export const taskAssignees = pgTable('task_assignees', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.taskId, table.userId] }),
}));

// Meetings table
export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  location: varchar('location', { length: 255 }),
  link: varchar('link', { length: 2048 }),
  notesMd: text('notes_md').default(''),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Meeting attendees table (junction table)
export const meetingAttendees = pgTable('meeting_attendees', {
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  responded: boolean('responded').notNull().default(false),
  response: varchar('response', { length: 20 }).notNull().default('pending'),
}, (table) => ({
  pk: primaryKey({ columns: [table.meetingId, table.userId] }),
}));

// Whiteboards table
export const whiteboards = pgTable('whiteboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  data: jsonb('data').notNull().default({}),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Whiteboard collaboration snapshots
export const whiteboardCollabSnapshots = pgTable('whiteboard_collab_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  whiteboardId: uuid('whiteboard_id').notNull().references(() => whiteboards.id, { onDelete: 'cascade' }),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Whiteboard collaboration updates
export const whiteboardCollabUpdates = pgTable('whiteboard_collab_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  whiteboardId: uuid('whiteboard_id').notNull().references(() => whiteboards.id, { onDelete: 'cascade' }),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  update: jsonb('update').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Task relations
export const taskStatusesRelations = relations(taskStatuses, ({ many }) => ({
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  status: one(taskStatuses, {
    fields: [tasks.statusId],
    references: [taskStatuses.id],
  }),
  createdBy: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
  }),
  assignees: many(taskAssignees),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignees.userId],
    references: [users.id],
  }),
}));

// Meeting relations
export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  project: one(projects, {
    fields: [meetings.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [meetings.createdBy],
    references: [users.id],
  }),
  attendees: many(meetingAttendees),
}));

export const meetingAttendeesRelations = relations(meetingAttendees, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingAttendees.meetingId],
    references: [meetings.id],
  }),
  user: one(users, {
    fields: [meetingAttendees.userId],
    references: [users.id],
  }),
}));

// Whiteboard relations
export const whiteboardsRelations = relations(whiteboards, ({ one }) => ({
  project: one(projects, {
    fields: [whiteboards.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [whiteboards.createdBy],
    references: [users.id],
  }),
}));

export const whiteboardCollabSnapshotsRelations = relations(whiteboardCollabSnapshots, ({ one }) => ({
  whiteboard: one(whiteboards, {
    fields: [whiteboardCollabSnapshots.whiteboardId],
    references: [whiteboards.id],
  }),
}));

export const whiteboardCollabUpdatesRelations = relations(whiteboardCollabUpdates, ({ one }) => ({
  whiteboard: one(whiteboards, {
    fields: [whiteboardCollabUpdates.whiteboardId],
    references: [whiteboards.id],
  }),
  actor: one(users, {
    fields: [whiteboardCollabUpdates.actorId],
    references: [users.id],
  }),
}));

// Notifications table
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  link: varchar('link', { length: 500 }),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  actor: one(users, {
    fields: [activityLogs.actorId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [activityLogs.projectId],
    references: [projects.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
}));

export const noticeBoardItemsRelations = relations(noticeBoardItems, ({ one }) => ({
  createdByUser: one(users, {
    fields: [noticeBoardItems.createdBy],
    references: [users.id],
    relationName: 'createdNoticeBoardItems',
  }),
  assignee: one(users, {
    fields: [noticeBoardItems.assigneeId],
    references: [users.id],
    relationName: 'assignedNoticeBoardItems',
  }),
  completedByUser: one(users, {
    fields: [noticeBoardItems.completedBy],
    references: [users.id],
    relationName: 'completedNoticeBoardItems',
  }),
}));

// Time entries table
export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
  note: varchar('note', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  project: one(projects, {
    fields: [timeEntries.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
}));

// Interview pipeline stages (configurable, like task_statuses)
export const interviewStages = pgTable('interview_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull().default('#6b7280'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Job positions (open roles / JDs)
export const jobPositions = pgTable('job_positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  department: varchar('department', { length: 100 }),
  descriptionMd: text('description_md').default(''),
  status: varchar('status', { length: 20 }).notNull().default(JobPositionStatus.OPEN),
  hiringManagerId: uuid('hiring_manager_id').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_hiring_positions_status').on(table.status),
  createdByIdx: index('idx_hiring_positions_created_by').on(table.createdBy),
}));

// Candidates (people being interviewed)
export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  resumeUrl: text('resume_url'),
  source: varchar('source', { length: 100 }),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdByIdx: index('idx_candidates_created_by').on(table.createdBy),
}));

// Job applications (links candidate to position + pipeline stage — the kanban card)
export const jobApplications = pgTable('job_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  positionId: uuid('position_id').notNull().references(() => jobPositions.id, { onDelete: 'cascade' }),
  stageId: uuid('stage_id').references(() => interviewStages.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  positionIdx: index('idx_job_applications_position').on(table.positionId),
  candidateIdx: index('idx_job_applications_candidate').on(table.candidateId),
  stageIdx: index('idx_job_applications_stage').on(table.stageId),
}));

// Interviews (scheduled interview sessions)
export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => jobApplications.id, { onDelete: 'cascade' }),
  interviewerId: uuid('interviewer_id').references(() => users.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  type: varchar('type', { length: 50 }),
  location: varchar('location', { length: 255 }),
  link: text('link'),
  rating: integer('rating'),
  feedback: text('feedback'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  applicationIdx: index('idx_interviews_application').on(table.applicationId),
  interviewerIdx: index('idx_interviews_interviewer').on(table.interviewerId),
}));

// Interview notes (rich-text notes using BlockNote JSON)
export const interviewNotes = pgTable('interview_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').references(() => jobApplications.id, { onDelete: 'cascade' }),
  interviewId: uuid('interview_id').references(() => interviews.id, { onDelete: 'cascade' }),
  docId: uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  content: jsonb('content').notNull().default([]),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  applicationIdx: index('idx_interview_notes_application').on(table.applicationId),
  interviewIdx: index('idx_interview_notes_interview').on(table.interviewId),
  docIdx: uniqueIndex('idx_interview_notes_doc_id_unique').on(table.docId),
}));

// Position docs (links positions to collaborative docs)
export const positionDocs = pgTable('position_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  positionId: uuid('position_id').notNull().references(() => jobPositions.id, { onDelete: 'cascade' }),
  docId: uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  positionSortIdx: index('idx_position_docs_position_sort').on(table.positionId, table.sortOrder),
  uniquePositionDoc: uniqueIndex('position_docs_position_doc_unique').on(table.positionId, table.docId),
  uniqueDocId: uniqueIndex('position_docs_doc_id_unique').on(table.docId),
}));

// Interview tracking relations
export const interviewStagesRelations = relations(interviewStages, ({ many }) => ({
  applications: many(jobApplications),
}));

export const jobPositionsRelations = relations(jobPositions, ({ one, many }) => ({
  hiringManager: one(users, {
    fields: [jobPositions.hiringManagerId],
    references: [users.id],
    relationName: 'hiringManagerPositions',
  }),
  createdByUser: one(users, {
    fields: [jobPositions.createdBy],
    references: [users.id],
    relationName: 'createdPositions',
  }),
  applications: many(jobApplications),
  docs: many(positionDocs),
}));

export const positionDocsRelations = relations(positionDocs, ({ one }) => ({
  position: one(jobPositions, {
    fields: [positionDocs.positionId],
    references: [jobPositions.id],
  }),
  doc: one(docs, {
    fields: [positionDocs.docId],
    references: [docs.id],
  }),
  createdByUser: one(users, {
    fields: [positionDocs.createdBy],
    references: [users.id],
  }),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [candidates.createdBy],
    references: [users.id],
    relationName: 'createdCandidates',
  }),
  applications: many(jobApplications),
}));

export const jobApplicationsRelations = relations(jobApplications, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [jobApplications.candidateId],
    references: [candidates.id],
  }),
  position: one(jobPositions, {
    fields: [jobApplications.positionId],
    references: [jobPositions.id],
  }),
  stage: one(interviewStages, {
    fields: [jobApplications.stageId],
    references: [interviewStages.id],
  }),
  createdByUser: one(users, {
    fields: [jobApplications.createdBy],
    references: [users.id],
    relationName: 'createdApplications',
  }),
  interviews: many(interviews),
  notes: many(interviewNotes),
}));

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  application: one(jobApplications, {
    fields: [interviews.applicationId],
    references: [jobApplications.id],
  }),
  interviewer: one(users, {
    fields: [interviews.interviewerId],
    references: [users.id],
    relationName: 'interviewerInterviews',
  }),
  createdByUser: one(users, {
    fields: [interviews.createdBy],
    references: [users.id],
    relationName: 'createdInterviews',
  }),
  notes: many(interviewNotes),
}));

export const interviewNotesRelations = relations(interviewNotes, ({ one }) => ({
  application: one(jobApplications, {
    fields: [interviewNotes.applicationId],
    references: [jobApplications.id],
  }),
  interview: one(interviews, {
    fields: [interviewNotes.interviewId],
    references: [interviews.id],
  }),
  doc: one(docs, {
    fields: [interviewNotes.docId],
    references: [docs.id],
  }),
  createdByUser: one(users, {
    fields: [interviewNotes.createdBy],
    references: [users.id],
    relationName: 'createdInterviewNotes',
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type ProjectStatus = typeof projectStatuses.$inferSelect;
export type NewProjectStatus = typeof projectStatuses.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type TeamProject = typeof teamProjects.$inferSelect;
export type NewTeamProject = typeof teamProjects.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type NewChannelMember = typeof channelMembers.$inferInsert;
export type BotChannelMember = typeof botChannelMembers.$inferSelect;
export type NewBotChannelMember = typeof botChannelMembers.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type Doc = typeof docs.$inferSelect;
export type NewDoc = typeof docs.$inferInsert;
export type TaskStatus = typeof taskStatuses.$inferSelect;
export type NewTaskStatus = typeof taskStatuses.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type MeetingAttendee = typeof meetingAttendees.$inferSelect;
export type NewMeetingAttendee = typeof meetingAttendees.$inferInsert;
export type Whiteboard = typeof whiteboards.$inferSelect;
export type NewWhiteboard = typeof whiteboards.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type NoticeBoardItem = typeof noticeBoardItems.$inferSelect;
export type NewNoticeBoardItem = typeof noticeBoardItems.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type InterviewStage = typeof interviewStages.$inferSelect;
export type NewInterviewStage = typeof interviewStages.$inferInsert;
export type JobPosition = typeof jobPositions.$inferSelect;
export type NewJobPosition = typeof jobPositions.$inferInsert;
export type PositionDoc = typeof positionDocs.$inferSelect;
export type NewPositionDoc = typeof positionDocs.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
export type InterviewNote = typeof interviewNotes.$inferSelect;
export type NewInterviewNote = typeof interviewNotes.$inferInsert;
