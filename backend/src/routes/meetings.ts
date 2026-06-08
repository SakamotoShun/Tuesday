import { Hono } from 'hono';
import { meetingService } from '../services';
import { auth, requireProjectAccess, requireProjectOwner } from '../middleware';
import { requireRouteParam } from '../utils/route-params';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createMeetingSchema, updateMeetingSchema } from '../utils/validation';
import { getPublicJaasSettings } from '../services/jaas';

const meetings = new Hono();

// All meeting routes require authentication
meetings.use('*', auth);

// GET /api/v1/meetings/projects/:id/meetings - List project meetings
meetings.get('/projects/:id/meetings', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = requireRouteParam(c, 'id');
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
meetings.post('/projects/:id/meetings', requireProjectOwner, async (c) => {
  try {
    const user = c.get('user');
    const projectId = requireRouteParam(c, 'id');
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

// POST /api/v1/meetings - Create standalone meeting/event
meetings.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createMeetingSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const meeting = await meetingService.createMeeting(null, validation.data, user);
    return success(c, meeting, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating standalone meeting:', error);
    return errors.internal(c, 'Failed to create meeting');
  }
});

// GET /api/v1/meetings/video-settings - Get video meeting configuration available to users
meetings.get('/video-settings', async (c) => {
  try {
    return success(c, await getPublicJaasSettings());
  } catch (error) {
    console.error('Error fetching video settings:', error);
    return errors.internal(c, 'Failed to fetch video settings');
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

// GET /api/v1/meetings/:id/join - Get a tokenized JaaS join URL for the current user
meetings.get('/:id/join', async (c) => {
  try {
    const user = c.get('user');
    const meetingId = requireRouteParam(c, 'id');
    return success(c, await meetingService.getJaasJoinUrl(meetingId, user));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Meeting not found') {
        return errors.notFound(c, error.message);
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating meeting join URL:', error);
    return errors.internal(c, 'Failed to create meeting join URL');
  }
});

// GET /api/v1/meetings/:id - Get meeting
meetings.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meetingId = requireRouteParam(c, 'id');

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
    const meetingId = requireRouteParam(c, 'id');
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
    const meetingId = requireRouteParam(c, 'id');

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
