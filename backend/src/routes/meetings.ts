import { Hono } from 'hono';
import { meetingService } from '../services';
import { auth, requireProjectAccess } from '../middleware';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createMeetingSchema, updateMeetingSchema } from '../utils/validation';

const meetings = new Hono();

// All meeting routes require authentication
meetings.use('*', auth);

// GET /api/v1/meetings/projects/:id/meetings - List project meetings
meetings.get('/projects/:id/meetings', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const projectMeetings = await meetingService.getProjectMeetings(projectId, user);
    return success(c, projectMeetings);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching meetings:', error);
    return errors.internal(c, 'Failed to fetch meetings');
  }
});

// POST /api/v1/meetings/projects/:id/meetings - Create meeting in project
meetings.post('/projects/:id/meetings', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createMeetingSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const meeting = await meetingService.createMeeting(projectId, validation.data, user);
    return success(c, meeting, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating meeting:', error);
    return errors.internal(c, 'Failed to create meeting');
  }
});

// GET /api/v1/meetings/my - List user's meetings across all projects
meetings.get('/my', async (c) => {
  try {
    const user = c.get('user');
    const myMeetings = await meetingService.getMyMeetings(user.id, user);
    return success(c, myMeetings);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching my meetings:', error);
    return errors.internal(c, 'Failed to fetch meetings');
  }
});

// GET /api/v1/meetings/:id - Get meeting
meetings.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meetingId = c.req.param('id');

    const meeting = await meetingService.getMeeting(meetingId, user);

    if (!meeting) {
      return errors.notFound(c, 'Meeting not found');
    }

    return success(c, meeting);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching meeting:', error);
    return errors.internal(c, 'Failed to fetch meeting');
  }
});

// PATCH /api/v1/meetings/:id - Update meeting
meetings.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meetingId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateMeetingSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const meeting = await meetingService.updateMeeting(meetingId, validation.data, user);

    if (!meeting) {
      return errors.notFound(c, 'Meeting not found');
    }

    return success(c, meeting);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating meeting:', error);
    return errors.internal(c, 'Failed to update meeting');
  }
});

// DELETE /api/v1/meetings/:id - Delete meeting
meetings.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meetingId = c.req.param('id');

    const deleted = await meetingService.deleteMeeting(meetingId, user);

    if (!deleted) {
      return errors.notFound(c, 'Meeting not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting meeting:', error);
    return errors.internal(c, 'Failed to delete meeting');
  }
});

export { meetings };
