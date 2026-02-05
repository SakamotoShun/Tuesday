import { z } from 'zod';
import { UserRole, ProjectMemberRole, TeamMemberRole, ProjectMemberSource } from '../db/schema';

// User role enum
export const UserRoleEnum = z.enum([UserRole.ADMIN, UserRole.MEMBER]);
export type UserRoleType = z.infer<typeof UserRoleEnum>;

// Project member role enum
export const ProjectMemberRoleEnum = z.enum([ProjectMemberRole.OWNER, ProjectMemberRole.MEMBER]);
export type ProjectMemberRoleType = z.infer<typeof ProjectMemberRoleEnum>;

// Team member role enum
export const TeamMemberRoleEnum = z.enum([TeamMemberRole.LEAD, TeamMemberRole.MEMBER]);
export type TeamMemberRoleType = z.infer<typeof TeamMemberRoleEnum>;

// Project member source enum
export const ProjectMemberSourceEnum = z.enum([ProjectMemberSource.DIRECT, ProjectMemberSource.TEAM]);
export type ProjectMemberSourceType = z.infer<typeof ProjectMemberSourceEnum>;

// Base user type (without password)
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  role: UserRoleEnum,
  isDisabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// Project status
export const ProjectStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number(),
  isDefault: z.boolean(),
  createdAt: z.date(),
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

// Project
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  client: z.string().nullable().optional(),
  statusId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid(),
  type: z.string().nullable().optional(),
  startDate: z.date().nullable().optional(),
  targetEndDate: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

// Project with status and owner
export const ProjectWithDetailsSchema = ProjectSchema.extend({
  status: ProjectStatusSchema.nullable().optional(),
  owner: UserSchema.nullable().optional(),
});

export type ProjectWithDetails = z.infer<typeof ProjectWithDetailsSchema>;

// Project member
export const ProjectMemberSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: ProjectMemberRoleEnum,
  source: ProjectMemberSourceEnum,
  sourceTeamId: z.string().uuid().nullable().optional(),
  joinedAt: z.date(),
});

export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

// Team
export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Team = z.infer<typeof TeamSchema>;

// Team member
export const TeamMemberSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: TeamMemberRoleEnum,
  joinedAt: z.date(),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

// Team project
export const TeamProjectSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  assignedAt: z.date(),
});

export type TeamProject = z.infer<typeof TeamProjectSchema>;

// Settings
export const SettingsSchema = z.record(z.any());
export type Settings = z.infer<typeof SettingsSchema>;
