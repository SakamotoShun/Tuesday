import { z } from 'zod';

// Email validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters');

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be less than 100 characters');

// Name validation
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name must be less than 255 characters');

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Login validation
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Registration validation
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Profile update validation
export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Change password validation
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Setup validation
export const setupSchema = z.object({
  workspaceName: z.string().min(1, 'Workspace name is required').max(255),
  adminEmail: emailSchema,
  adminName: nameSchema,
  adminPassword: passwordSchema,
});

export type SetupInput = z.infer<typeof setupSchema>;

// Bot validation schemas
const botNameSchema = z.string().min(1, 'Bot name is required').max(100);
const botAvatarUrlSchema = z.string().url('Invalid avatar URL').max(2000).optional().nullable();

export const createBotSchema = z.object({
  name: botNameSchema,
  avatarUrl: botAvatarUrlSchema,
  type: z.enum(['webhook', 'ai']).default('webhook'),
  provider: z.enum(['openai', 'openrouter']).default('openai'),
  systemPrompt: z.string().max(10000).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;

export const updateBotSchema = z.object({
  name: botNameSchema.optional(),
  avatarUrl: botAvatarUrlSchema,
  isDisabled: z.boolean().optional(),
  provider: z.enum(['openai', 'openrouter']).optional(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
});

export type UpdateBotInput = z.infer<typeof updateBotSchema>;

export const addBotToChannelSchema = z.object({
  channelId: uuidSchema,
});

export type AddBotToChannelInput = z.infer<typeof addBotToChannelSchema>;

export const webhookMessageSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
});

export type WebhookMessageInput = z.infer<typeof webhookMessageSchema>;

// Validate request body helper
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Format Zod errors for API response
export function formatValidationErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

// Project validation schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  client: z.string().max(255).optional(),
  statusId: uuidSchema.optional(),
  type: z.string().max(50).optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  templateId: uuidSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const toggleTemplateSchema = z.object({
  isTemplate: z.boolean(),
});

export type ToggleTemplateInput = z.infer<typeof toggleTemplateSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name cannot be empty').max(255).optional(),
  client: z.string().max(255).optional().nullable(),
  statusId: uuidSchema.optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetEndDate: z.string().optional().nullable(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const addMemberSchema = z.object({
  userId: uuidSchema,
  role: z.enum(['owner', 'member']).default('member'),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'member']),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// Team validation schemas
export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255),
  description: z.string().max(1000).optional().nullable(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
});

export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
  userId: uuidSchema,
  role: z.enum(['lead', 'member']).default('member'),
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  role: z.enum(['lead', 'member']),
});

export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const assignTeamProjectSchema = z.object({
  projectId: uuidSchema,
});

export type AssignTeamProjectInput = z.infer<typeof assignTeamProjectSchema>;

// Status validation schemas
export const createStatusSchema = z.object({
  name: z.string().min(1, 'Status name is required').max(50),
  color: z.string().max(20).default('#6b7280'),
  sortOrder: z.number().int().default(0),
});

export type CreateStatusInput = z.infer<typeof createStatusSchema>;

export const updateStatusSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const reorderStatusSchema = z.object({
  ids: z.array(uuidSchema),
});

export type ReorderStatusInput = z.infer<typeof reorderStatusSchema>;

// Doc validation schemas
export const createDocSchema = z.object({
  title: z.string().min(1, 'Doc title is required').max(255),
  content: z.array(z.record(z.unknown())).optional(),
  parentId: uuidSchema.optional().nullable(),
  isDatabase: z.boolean().default(false),
  schema: z.record(z.unknown()).optional().nullable(),
  properties: z.record(z.unknown()).optional().default({}),
});

export type CreateDocInput = z.infer<typeof createDocSchema>;

export const updateDocSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.array(z.record(z.unknown())).optional(),
  parentId: uuidSchema.optional().nullable(),
  schema: z.record(z.unknown()).optional().nullable(),
  properties: z.record(z.unknown()).optional(),
});

export type UpdateDocInput = z.infer<typeof updateDocSchema>;

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(255),
  descriptionMd: z.string().optional(),
  statusId: uuidSchema.optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  assigneeIds: z.array(uuidSchema).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  descriptionMd: z.string().optional(),
  statusId: uuidSchema.optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z.object({
  statusId: uuidSchema,
});

export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const updateTaskOrderSchema = z.object({
  sortOrder: z.number().int().min(0),
});

export type UpdateTaskOrderInput = z.infer<typeof updateTaskOrderSchema>;

export const updateTaskAssigneesSchema = z.object({
  assigneeIds: z.array(uuidSchema),
});

export type UpdateTaskAssigneesInput = z.infer<typeof updateTaskAssigneesSchema>;

// Notice board validation schemas
export const noticeBoardItemTypeSchema = z.enum(['announcement', 'todo']);

export const createNoticeBoardItemSchema = z.object({
  type: noticeBoardItemTypeSchema,
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional().nullable(),
  assigneeId: uuidSchema.optional().nullable(),
});

export type CreateNoticeBoardItemInput = z.infer<typeof createNoticeBoardItemSchema>;

export const updateNoticeBoardItemSchema = z.object({
  type: noticeBoardItemTypeSchema.optional(),
  title: z.string().min(1, 'Title cannot be empty').max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  assigneeId: uuidSchema.optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateNoticeBoardItemInput = z.infer<typeof updateNoticeBoardItemSchema>;

// Meeting validation schemas
export const createMeetingSchema = z.object({
  title: z.string().min(1, 'Meeting title is required').max(255),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  location: z.string().max(255).optional(),
  link: z.string().max(2048).optional(),
  notesMd: z.string().optional(),
  attendeeIds: z.array(uuidSchema).optional(),
  teamIds: z.array(uuidSchema).optional(),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  link: z.string().max(2048).optional().nullable(),
  notesMd: z.string().optional().nullable(),
  attendeeIds: z.array(uuidSchema).optional(),
  teamIds: z.array(uuidSchema).optional(),
});

export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

// Chat validation schemas
export const createChannelSchema = z.object({
  name: z.string().min(1, 'Channel name is required').max(100),
  projectId: uuidSchema.optional().nullable(),
  type: z.enum(['workspace', 'project']).optional(),
  access: z.enum(['public', 'private', 'invite_only']).optional(),
  description: z.string().max(500).optional().nullable(),
  memberIds: z.array(uuidSchema).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const createDMSchema = z.object({
  userId: uuidSchema,
});

export type CreateDMInput = z.infer<typeof createDMSchema>;

export const addChannelMembersSchema = z.object({
  userIds: z.array(uuidSchema).min(1, 'At least one member is required'),
});

export type AddChannelMembersInput = z.infer<typeof addChannelMembersSchema>;

export const updateChannelSchema = z.object({
  name: z.string().min(1, 'Channel name is required').max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const reorderChannelsSchema = z.object({
  channelIds: z.array(uuidSchema).min(1, 'At least one channel is required'),
});

export type ReorderChannelsInput = z.infer<typeof reorderChannelsSchema>;

export const createMessageSchema = z.object({
  content: z.string().max(5000).optional(),
  attachmentIds: z.array(uuidSchema).optional(),
}).refine((data) => {
  const content = data.content?.trim() ?? '';
  return content.length > 0 || (data.attachmentIds?.length ?? 0) > 0;
}, {
  message: 'Message content or attachment is required',
  path: ['content'],
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const addReactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(50),
});

export type AddReactionInput = z.infer<typeof addReactionSchema>;

export const updateMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000),
});

export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

// Whiteboard validation schemas
export const createWhiteboardSchema = z.object({
  name: z.string().min(1, 'Whiteboard name is required').max(255),
  data: z.record(z.unknown()).optional(),
});

export type CreateWhiteboardInput = z.infer<typeof createWhiteboardSchema>;

export const updateWhiteboardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  data: z.record(z.unknown()).optional().nullable(),
});

export type UpdateWhiteboardInput = z.infer<typeof updateWhiteboardSchema>;

// Time entry validation schemas
export const upsertTimeEntrySchema = z.object({
  projectId: uuidSchema.nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  hours: z.number().min(0, 'Hours must be at least 0').max(24, 'Hours cannot exceed 24'),
  note: z.string().max(500, 'Note must be less than 500 characters').optional(),
});

export type UpsertTimeEntryInput = z.infer<typeof upsertTimeEntrySchema>;

// Favorites validation schemas
export const favoriteEntityTypeSchema = z.enum(['project', 'task', 'doc']);

export const createFavoriteSchema = z.object({
  entityType: favoriteEntityTypeSchema,
  entityId: uuidSchema,
});

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

export const reorderFavoritesSchema = z.object({
  favoriteIds: z.array(uuidSchema).min(1, 'At least one favorite ID is required'),
});

export type ReorderFavoritesInput = z.infer<typeof reorderFavoritesSchema>;

// Interview stage validation schemas
export const createInterviewStageSchema = z.object({
  name: z.string().min(1, 'Stage name is required').max(50),
  color: z.string().max(20).default('#6b7280'),
  sortOrder: z.number().int().default(0),
});

export type CreateInterviewStageInput = z.infer<typeof createInterviewStageSchema>;

export const updateInterviewStageSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateInterviewStageInput = z.infer<typeof updateInterviewStageSchema>;

export const reorderInterviewStagesSchema = z.object({
  ids: z.array(uuidSchema),
});

export type ReorderInterviewStagesInput = z.infer<typeof reorderInterviewStagesSchema>;

// Job position validation schemas
export const createJobPositionSchema = z.object({
  title: z.string().min(1, 'Position title is required').max(200),
  department: z.string().max(100).optional().nullable(),
  descriptionMd: z.string().optional(),
  status: z.enum(['open', 'on_hold', 'closed']).default('open'),
  hiringManagerId: uuidSchema.optional().nullable(),
});

export type CreateJobPositionInput = z.infer<typeof createJobPositionSchema>;

export const updateJobPositionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  department: z.string().max(100).optional().nullable(),
  descriptionMd: z.string().optional(),
  status: z.enum(['open', 'on_hold', 'closed']).optional(),
  hiringManagerId: uuidSchema.optional().nullable(),
});

export type UpdateJobPositionInput = z.infer<typeof updateJobPositionSchema>;

// Candidate validation schemas
const candidateSourceSchema = z.enum(['MyCareersFuture', 'Referal', 'Linkedin', 'Others']);

export const createCandidateSchema = z.object({
  name: z.string().min(1, 'Candidate name is required').max(200),
  email: z.string().email('Invalid email format').max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  resumeUrl: z.string().max(2048).optional().nullable(),
  source: candidateSourceSchema.optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email('Invalid email format').max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  resumeUrl: z.string().max(2048).optional().nullable(),
  source: candidateSourceSchema.optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

// Job application validation schemas
export const createJobApplicationSchema = z.object({
  candidateId: uuidSchema,
  positionId: uuidSchema,
  stageId: uuidSchema.optional(),
});

export type CreateJobApplicationInput = z.infer<typeof createJobApplicationSchema>;

export const updateJobApplicationSchema = z.object({
  stageId: uuidSchema.optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateJobApplicationInput = z.infer<typeof updateJobApplicationSchema>;

export const moveApplicationSchema = z.object({
  stageId: uuidSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export type MoveApplicationInput = z.infer<typeof moveApplicationSchema>;

// Interview validation schemas
export const createInterviewSchema = z.object({
  applicationId: uuidSchema,
  interviewerId: uuidSchema.optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).max(480).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  link: z.string().max(2048).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  feedback: z.string().optional().nullable(),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const updateInterviewSchema = z.object({
  interviewerId: uuidSchema.optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).max(480).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  link: z.string().max(2048).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  feedback: z.string().optional().nullable(),
});

export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;

// Interview note validation schemas
export const createInterviewNoteSchema = z.object({
  applicationId: uuidSchema.optional().nullable(),
  interviewId: uuidSchema.optional().nullable(),
  title: z.string().min(1, 'Note title is required').max(200),
  content: z.array(z.record(z.unknown())).optional(),
});

export type CreateInterviewNoteInput = z.infer<typeof createInterviewNoteSchema>;

export const updateInterviewNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.array(z.record(z.unknown())).optional(),
});

export type UpdateInterviewNoteInput = z.infer<typeof updateInterviewNoteSchema>;

export const createPositionDocSchema = z.object({
  title: z.string().min(1, 'Doc title is required').max(255),
  content: z.array(z.record(z.unknown())).optional(),
});

export type CreatePositionDocInput = z.infer<typeof createPositionDocSchema>;
