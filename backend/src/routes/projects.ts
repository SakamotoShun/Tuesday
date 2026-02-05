import { Hono } from 'hono';
import { projectService, taskService } from '../services';
import { auth, requireProjectMember, requireProjectOwner } from '../middleware';
import { success, errors } from '../utils/response';
import { 
  validateBody, 
  formatValidationErrors, 
  createProjectSchema, 
  updateProjectSchema, 
  addMemberSchema, 
  updateMemberSchema,
  createTaskSchema,
} from '../utils/validation';

const projects = new Hono();

// All project routes require authentication
projects.use('*', auth);

// GET /api/v1/projects - List user's projects
projects.get('/', async (c) => {
  try {
    const user = c.get('user');
    const userProjects = await projectService.getProjects(user);
    return success(c, userProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return errors.internal(c, 'Failed to fetch projects');
  }
});

// POST /api/v1/projects - Create project
projects.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createProjectSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const project = await projectService.createProject(validation.data, user);
    return success(c, project, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating project:', error);
    return errors.internal(c, 'Failed to create project');
  }
});

// GET /api/v1/projects/:id - Get project details
projects.get('/:id', requireProjectMember, async (c) => {
  try {
    const project = c.get('project');
    return success(c, project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return errors.internal(c, 'Failed to fetch project');
  }
});

// PATCH /api/v1/projects/:id - Update project
projects.patch('/:id', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateProjectSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const project = await projectService.updateProject(projectId, validation.data, user);
    
    if (!project) {
      return errors.notFound(c, 'Project not found');
    }

    return success(c, project);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating project:', error);
    return errors.internal(c, 'Failed to update project');
  }
});

// DELETE /api/v1/projects/:id - Delete project
projects.delete('/:id', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');

    const deleted = await projectService.deleteProject(projectId, user);
    
    if (!deleted) {
      return errors.notFound(c, 'Project not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting project:', error);
    return errors.internal(c, 'Failed to delete project');
  }
});

// GET /api/v1/projects/:id/members - List project members
projects.get('/:id/members', requireProjectMember, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const members = await projectService.getMembers(projectId, user);
    return success(c, members);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching members:', error);
    return errors.internal(c, 'Failed to fetch members');
  }
});

// GET /api/v1/projects/:id/teams - List teams assigned to project
projects.get('/:id/teams', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const teams = await projectService.getAssignedTeams(projectId, user);
    return success(c, teams);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching project teams:', error);
    return errors.internal(c, 'Failed to fetch project teams');
  }
});

// POST /api/v1/projects/:id/members - Add member
projects.post('/:id/members', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(addMemberSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const member = await projectService.addMember(
      projectId,
      validation.data.userId,
      validation.data.role,
      user
    );

    return success(c, member, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error adding member:', error);
    return errors.internal(c, 'Failed to add member');
  }
});

// PATCH /api/v1/projects/:id/members/:userId - Update member role
projects.patch('/:id/members/:userId', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const memberUserId = c.req.param('userId');
    const body = await c.req.json();

    const validation = validateBody(updateMemberSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const member = await projectService.updateMemberRole(
      projectId,
      memberUserId,
      validation.data.role,
      user
    );

    if (!member) {
      return errors.notFound(c, 'Member not found');
    }

    return success(c, member);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating member:', error);
    return errors.internal(c, 'Failed to update member');
  }
});

// DELETE /api/v1/projects/:id/members/:userId - Remove member
projects.delete('/:id/members/:userId', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const memberUserId = c.req.param('userId');

    const removed = await projectService.removeMember(projectId, memberUserId, user);

    if (!removed) {
      return errors.notFound(c, 'Member not found');
    }

    return success(c, { removed: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to remove member');
  }
});

// GET /api/v1/projects/:id/tasks - List project tasks
projects.get('/:id/tasks', requireProjectMember, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    
    // Parse query filters
    const query = c.req.query();
    const filters = {
      statusId: query.statusId,
      assigneeId: query.assigneeId,
    };

    const projectTasks = await taskService.getProjectTasks(projectId, user, filters);
    return success(c, projectTasks);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching tasks:', error);
    return errors.internal(c, 'Failed to fetch tasks');
  }
});

// POST /api/v1/projects/:id/tasks - Create task in project
projects.post('/:id/tasks', requireProjectMember, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createTaskSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const task = await taskService.createTask(projectId, validation.data, user);
    return success(c, task, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating task:', error);
    return errors.internal(c, 'Failed to create task');
  }
});

export { projects };
