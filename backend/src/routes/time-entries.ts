import { Hono } from 'hono';
import { timeEntryService } from '../services';
import { auth } from '../middleware';
import { success, errors } from '../utils/response';
import {
  validateBody,
  formatValidationErrors,
  upsertTimeEntrySchema,
} from '../utils/validation';

const timeEntries = new Hono();

timeEntries.use('*', auth);

timeEntries.get('/my', async (c) => {
  try {
    const user = c.get('user');
    const week = c.req.query('week');

    if (!week) {
      return errors.badRequest(c, 'Week parameter is required (YYYY-MM-DD)');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(week)) {
      return errors.badRequest(c, 'Invalid week format. Use YYYY-MM-DD');
    }

    const timesheet = await timeEntryService.getMyWeeklyTimesheet(user.id, week);
    return success(c, timesheet);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching timesheet:', error);
    return errors.internal(c, 'Failed to fetch timesheet');
  }
});

timeEntries.get('/my/overview', async (c) => {
  try {
    const user = c.get('user');
    const month = c.req.query('month');

    if (!month) {
      return errors.badRequest(c, 'Month parameter is required (YYYY-MM)');
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return errors.badRequest(c, 'Invalid month format. Use YYYY-MM');
    }

    const [year, monthNum] = month.split('-').map(Number);
    const overview = await timeEntryService.getMyMonthlyOverview(user.id, year, monthNum);
    return success(c, overview);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching monthly overview:', error);
    return errors.internal(c, 'Failed to fetch monthly overview');
  }
});

timeEntries.get('/my/export', async (c) => {
  try {
    const user = c.get('user');
    const start = c.req.query('start');
    const end = c.req.query('end');

    if (!start || !end) {
      return errors.badRequest(c, 'Start and end parameters are required (YYYY-MM-DD)');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return errors.badRequest(c, 'Invalid date format. Use YYYY-MM-DD');
    }

    const csv = await timeEntryService.exportUserCsv(user.id, start, end);

    return c.text(csv, 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="timesheet-${start}-to-${end}.csv"`,
    });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error exporting timesheet:', error);
    return errors.internal(c, 'Failed to export timesheet');
  }
});

timeEntries.put('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(upsertTimeEntrySchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const entry = await timeEntryService.upsertEntry(user.id, validation.data, user);
    return success(c, entry);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error upserting time entry:', error);
    return errors.internal(c, 'Failed to save time entry');
  }
});

timeEntries.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const entryId = c.req.param('id');

    const deleted = await timeEntryService.deleteEntry(user.id, entryId);

    if (!deleted) {
      return errors.notFound(c, 'Time entry not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error deleting time entry:', error);
    return errors.internal(c, 'Failed to delete time entry');
  }
});

export { timeEntries };
