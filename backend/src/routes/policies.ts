import { Hono } from 'hono';
import { auth, requireAdmin } from '../middleware';
import { policyService } from '../services';
import { success, errors } from '../utils/response';
import {
  createDocSchema,
  formatValidationErrors,
  updateDocSchema,
  validateBody,
} from '../utils/validation';

const policies = new Hono();

policies.use('*', auth);

// GET /api/v1/policies - List policy databases
policies.get('/', async (c) => {
  try {
    const databases = await policyService.listDatabases();
    return success(c, databases);
  } catch (error) {
    console.error('Error fetching policy databases:', error);
    return errors.internal(c, 'Failed to fetch policy databases');
  }
});

// POST /api/v1/policies - Create policy database (admin only)
policies.post('/', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const database = await policyService.createDatabase(
      {
        title: validation.data.title,
        schema: validation.data.schema,
      },
      user
    );

    return success(c, database, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating policy database:', error);
    return errors.internal(c, 'Failed to create policy database');
  }
});

// POST /api/v1/policies/:id/rows - Create policy row (admin only)
policies.post('/:id/rows', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const databaseId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const row = await policyService.createRow(
      databaseId,
      {
        title: validation.data.title,
        content: validation.data.content,
        properties: validation.data.properties,
      },
      user
    );

    return success(c, row, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating policy row:', error);
    return errors.internal(c, 'Failed to create policy row');
  }
});

// GET /api/v1/policies/:id/rows/:rowId - Get policy row
policies.get('/:id/rows/:rowId', async (c) => {
  try {
    const databaseId = c.req.param('id');
    const rowId = c.req.param('rowId');

    const row = await policyService.getRow(databaseId, rowId);
    if (!row) {
      return errors.notFound(c, 'Policy row');
    }

    return success(c, row);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching policy row:', error);
    return errors.internal(c, 'Failed to fetch policy row');
  }
});

// PATCH /api/v1/policies/:id/rows/:rowId - Update policy row (admin only)
policies.patch('/:id/rows/:rowId', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const databaseId = c.req.param('id');
    const rowId = c.req.param('rowId');
    const body = await c.req.json();

    const validation = validateBody(updateDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const row = await policyService.updateRow(databaseId, rowId, validation.data, user);
    if (!row) {
      return errors.notFound(c, 'Policy row');
    }

    return success(c, row);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating policy row:', error);
    return errors.internal(c, 'Failed to update policy row');
  }
});

// DELETE /api/v1/policies/:id/rows/:rowId - Delete policy row (admin only)
policies.delete('/:id/rows/:rowId', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const databaseId = c.req.param('id');
    const rowId = c.req.param('rowId');

    const deleted = await policyService.deleteRow(databaseId, rowId, user);
    if (!deleted) {
      return errors.notFound(c, 'Policy row');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting policy row:', error);
    return errors.internal(c, 'Failed to delete policy row');
  }
});

// GET /api/v1/policies/:id - Get policy database with rows
policies.get('/:id', async (c) => {
  try {
    const databaseId = c.req.param('id');
    const database = await policyService.getDatabaseWithRows(databaseId);

    if (!database) {
      return errors.notFound(c, 'Policy database');
    }

    return success(c, database);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching policy database:', error);
    return errors.internal(c, 'Failed to fetch policy database');
  }
});

// PATCH /api/v1/policies/:id - Update policy database (admin only)
policies.patch('/:id', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const databaseId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const database = await policyService.updateDatabase(
      databaseId,
      {
        title: validation.data.title,
        schema: validation.data.schema,
      },
      user
    );

    if (!database) {
      return errors.notFound(c, 'Policy database');
    }

    return success(c, database);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating policy database:', error);
    return errors.internal(c, 'Failed to update policy database');
  }
});

// DELETE /api/v1/policies/:id - Delete policy database (admin only)
policies.delete('/:id', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const databaseId = c.req.param('id');

    const deleted = await policyService.deleteDatabase(databaseId, user);
    if (!deleted) {
      return errors.notFound(c, 'Policy database');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting policy database:', error);
    return errors.internal(c, 'Failed to delete policy database');
  }
});

export { policies };
