import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, date, primaryKey, bigserial, bigint, customType } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// User roles
export const UserRole = {
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

// Project member roles
export const ProjectMemberRole = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export type ProjectMemberRole = typeof ProjectMemberRole[keyof typeof ProjectMemberRole];

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Project members table
export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default(ProjectMemberRole.MEMBER),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.userId] }),
}));

// Chat channels table
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('project'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chat messages table
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  mentions: uuid('mentions').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Channel members table
export const channelMembers = pgTable('channel_members', {
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.channelId, table.userId] }),
}));

// Docs table
export const docs = pgTable('docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  title: varchar('title', { length: 255 }).notNull(),
  content: jsonb('content').notNull().default([]),
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


// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projectMembers),
  createdProjects: many(projects, { relationName: 'createdProjects' }),
  sessions: many(sessions),
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
export const channelsRelations = relations(channels, ({ one, many }) => ({
  project: one(projects, {
    fields: [channels.projectId],
    references: [projects.id],
  }),
  messages: many(messages),
  members: many(channelMembers),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
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
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  location: varchar('location', { length: 255 }),
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

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type ProjectStatus = typeof projectStatuses.$inferSelect;
export type NewProjectStatus = typeof projectStatuses.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type NewChannelMember = typeof channelMembers.$inferInsert;
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
