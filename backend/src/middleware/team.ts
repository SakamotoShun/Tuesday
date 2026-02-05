import type { Context, Next } from 'hono';
import { teamService } from '../services';
import { errors } from '../utils/response';
import type { Team } from '../db/schema';

// Extend Hono context to include team
declare module 'hono' {
  interface ContextVariableMap {
    team: Team;
  }
}

/**
 * Middleware to require team membership
 * - Extracts team ID from URL params
 * - Checks if current user is a member (or admin)
 * - Returns 403 if not a member
 * - Adds team to request context
 */
export async function requireTeamAccess(c: Context, next: Next) {
  const teamId = c.req.param('id');
  const user = c.get('user');

  if (!teamId) {
    return errors.badRequest(c, 'Team ID is required');
  }

  const hasAccess = await teamService.hasAccess(teamId, user);
  if (!hasAccess) {
    return errors.forbidden(c, 'You do not have access to this team');
  }

  const team = await teamService.getTeam(teamId, user);
  if (!team) {
    return errors.notFound(c, 'Team not found');
  }

  c.set('team', team);
  await next();
}

/**
 * Middleware to require team lead
 * - Extends member check
 * - Verifies user has "lead" role on team (or is admin)
 * - Returns 403 if not lead
 */
export async function requireTeamLead(c: Context, next: Next) {
  const teamId = c.req.param('id');
  const user = c.get('user');

  if (!teamId) {
    return errors.badRequest(c, 'Team ID is required');
  }

  const isLead = await teamService.isLead(teamId, user);
  if (!isLead) {
    return errors.forbidden(c, 'Only team leads can perform this action');
  }

  const team = await teamService.getTeam(teamId, user);
  if (!team) {
    return errors.notFound(c, 'Team not found');
  }

  c.set('team', team);
  await next();
}
