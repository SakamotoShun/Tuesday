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

// Setup validation
export const setupSchema = z.object({
  workspaceName: z.string().min(1, 'Workspace name is required').max(255),
  adminEmail: emailSchema,
  adminName: nameSchema,
  adminPassword: passwordSchema,
});

export type SetupInput = z.infer<typeof setupSchema>;

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
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

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
