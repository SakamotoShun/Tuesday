import { Hono } from 'hono';
import { teamService } from '../services';
import { auth, requireAdmin, requireTeamAccess, requireTeamLead } from '../middleware';
import { success, errors } from '../utils/response';
import {
  validateBody,
  formatValidationErrors,
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
  updateTeamMemberSchema,
  assignTeamProjectSchema,
} from '../utils/validation';

const teams = new Hono();

// All team routes require authentication
teams.use('*', auth);

// GET /api/v1/teams - List teams
teams.get('/', async (c) => {
  try {
    const user = c.get('user');
    const list = await teamService.listTeams(user);
    return success(c, list);
  } catch (error) {
    console.error('Error fetching teams:', error);
    return errors.internal(c, 'Failed to fetch teams');
  }
});

// POST /api/v1/teams - Create team (admin only)
teams.post('/', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createTeamSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const team = await teamService.createTeam(validation.data, user);
    return success(c, team, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating team:', error);
    return errors.internal(c, 'Failed to create team');
  }
});

// GET /api/v1/teams/:id - Get team
teams.get('/:id', requireTeamAccess, async (c) => {
  try {
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const team = c.get('team');
    return success(c, team);
  } catch (error) {
    console.error('Error fetching team:', error);
    return errors.internal(c, 'Failed to fetch team');
  }
});

// PATCH /api/v1/teams/:id - Update team
teams.patch('/:id', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const body = await c.req.json();

    const validation = validateBody(updateTeamSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const team = await teamService.updateTeam(teamId, validation.data, user);
    if (!team) {
      return errors.notFound(c, 'Team not found');
    }

    return success(c, team);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating team:', error);
    return errors.internal(c, 'Failed to update team');
  }
});

// DELETE /api/v1/teams/:id - Delete team (admin only)
teams.delete('/:id', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }

    const deleted = await teamService.deleteTeam(teamId, user);
    if (!deleted) {
      return errors.notFound(c, 'Team not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting team:', error);
    return errors.internal(c, 'Failed to delete team');
  }
});

// GET /api/v1/teams/:id/members - List team members
teams.get('/:id/members', requireTeamAccess, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const members = await teamService.getMembers(teamId, user);
    return success(c, members);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching team members:', error);
    return errors.internal(c, 'Failed to fetch team members');
  }
});

// POST /api/v1/teams/:id/members - Add team member
teams.post('/:id/members', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const body = await c.req.json();

    const validation = validateBody(addTeamMemberSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const role = validation.data.role ?? 'member';
    const member = await teamService.addMember(teamId, validation.data.userId, role, user);
    return success(c, member, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error adding team member:', error);
    return errors.internal(c, 'Failed to add team member');
  }
});

// PATCH /api/v1/teams/:id/members/:userId - Update team member role
teams.patch('/:id/members/:userId', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    const memberUserId = c.req.param('userId') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    if (!memberUserId) {
      return errors.badRequest(c, 'User ID is required');
    }
    const body = await c.req.json();

    const validation = validateBody(updateTeamMemberSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const member = await teamService.updateMemberRole(teamId, memberUserId, validation.data.role, user);
    if (!member) {
      return errors.notFound(c, 'Member not found');
    }

    return success(c, member);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating team member role:', error);
    return errors.internal(c, 'Failed to update team member role');
  }
});

// DELETE /api/v1/teams/:id/members/:userId - Remove team member
teams.delete('/:id/members/:userId', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    const memberUserId = c.req.param('userId') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    if (!memberUserId) {
      return errors.badRequest(c, 'User ID is required');
    }

    const removed = await teamService.removeMember(teamId, memberUserId, user);
    if (!removed) {
      return errors.notFound(c, 'Member not found');
    }

    return success(c, { removed: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error removing team member:', error);
    return errors.internal(c, 'Failed to remove team member');
  }
});

// GET /api/v1/teams/:id/projects - List team projects
teams.get('/:id/projects', requireTeamAccess, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const projects = await teamService.getProjects(teamId, user);
    return success(c, projects);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching team projects:', error);
    return errors.internal(c, 'Failed to fetch team projects');
  }
});

// POST /api/v1/teams/:id/projects - Assign project to team
teams.post('/:id/projects', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    const body = await c.req.json();

    const validation = validateBody(assignTeamProjectSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const teamProject = await teamService.assignProject(teamId, validation.data.projectId, user);
    return success(c, teamProject, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error assigning project to team:', error);
    return errors.internal(c, 'Failed to assign project');
  }
});

// DELETE /api/v1/teams/:id/projects/:projectId - Unassign project from team
teams.delete('/:id/projects/:projectId', requireTeamLead, async (c) => {
  try {
    const user = c.get('user');
    const teamId = c.req.param('id') ?? '';
    const projectId = c.req.param('projectId') ?? '';
    if (!teamId) {
      return errors.badRequest(c, 'Team ID is required');
    }
    if (!projectId) {
      return errors.badRequest(c, 'Project ID is required');
    }

    const removed = await teamService.unassignProject(teamId, projectId, user);
    if (!removed) {
      return errors.notFound(c, 'Project assignment not found');
    }

    return success(c, { removed: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error unassigning project from team:', error);
    return errors.internal(c, 'Failed to unassign project');
  }
});

export { teams };
