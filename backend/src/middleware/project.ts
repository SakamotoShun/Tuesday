import type { Context, Next } from 'hono';
import { projectService } from '../services';
import { errors } from '../utils/response';
import type { Project } from '../db/schema';

// Extend Hono context to include project
declare module 'hono' {
  interface ContextVariableMap {
    project: Project;
  }
}

/**
 * Middleware to require project membership
 * - Extracts project ID from URL params
 * - Checks if current user is a member (or admin)
 * - Returns 403 if not a member
 * - Adds project to request context
 */
export async function requireProjectMember(c: Context, next: Next) {
  const projectId = c.req.param('id');
  const user = c.get('user');

  if (!projectId) {
    return errors.badRequest(c, 'Project ID is required');
  }

  const hasAccess = await projectService.hasAccess(projectId, user);
  
  if (!hasAccess) {
    return errors.forbidden(c, 'You do not have access to this project');
  }

  // Load project and set in context
  const project = await projectService.getProject(projectId, user);
  if (!project) {
    return errors.notFound(c, 'Project not found');
  }

  c.set('project', project);
  await next();
}

/**
 * Middleware to require project ownership
 * - Extends member check
 * - Verifies user has "owner" role on project (or is admin)
 * - Returns 403 if not owner
 */
export async function requireProjectOwner(c: Context, next: Next) {
  const projectId = c.req.param('id');
  const user = c.get('user');

  if (!projectId) {
    return errors.badRequest(c, 'Project ID is required');
  }

  const isOwner = await projectService.isOwner(projectId, user);
  
  if (!isOwner) {
    return errors.forbidden(c, 'Only project owners can perform this action');
  }

  // Load project and set in context
  const project = await projectService.getProject(projectId, user);
  if (!project) {
    return errors.notFound(c, 'Project not found');
  }

  c.set('project', project);
  await next();
}

/**
 * Middleware to require project membership for doc/task routes
 * - Extracts project ID from URL params (usually 'id' for docs/tasks)
 * - Checks if current user is a member
 * - Returns 403 if not a member
 */
export async function requireProjectAccess(c: Context, next: Next) {
  const projectId = c.req.param('id');
  const user = c.get('user');

  if (!projectId) {
    return errors.badRequest(c, 'Project ID is required');
  }

  const hasAccess = await projectService.hasAccess(projectId, user);
  
  if (!hasAccess) {
    return errors.forbidden(c, 'You do not have access to this project');
  }

  await next();
}
